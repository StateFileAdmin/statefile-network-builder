import { seedRegister } from "./data/seed";
import {
  isNetworkRegister,
  MAX_REGISTER_BYTES,
  registerByteLength,
} from "./data/validation";
import type { NetworkRegister, Site } from "./types";
import {
  handleAuth,
  requireCsrf,
  sessionUser,
  type AppUser,
  type AuthEnv,
} from "./auth";
import { handleAdmin } from "./admin";

export interface Env extends AuthEnv {
  ASSETS: Fetcher;
}

const REGISTER_ID = "default";
const MAX_REQUEST_BYTES = MAX_REGISTER_BYTES + 10_000;
interface RegisterRow {
  document: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

const SELECT_REGISTER =
  "SELECT document, version, updated_at, updated_by FROM register WHERE id = ?";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

const toLoaded = (row: RegisterRow) => ({
  register: JSON.parse(row.document) as NetworkRegister,
  version: row.version,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

const canAccessSite = (user: AppUser, siteId: string) =>
  user.role === "admin" || user.scopeAll || user.siteIds.includes(siteId);
const visibleRegister = (
  register: NetworkRegister,
  user: AppUser,
): NetworkRegister => {
  if (user.role === "admin" || user.scopeAll) return register;
  const siteIds = new Set(user.siteIds);
  return {
    ...register,
    sites: register.sites.filter((site) => siteIds.has(site.id)),
    siteRelationships: (register.siteRelationships ?? []).filter(
      (link) =>
        siteIds.has(link.sourceSiteId) && siteIds.has(link.targetSiteId),
    ),
  };
};
const containsAllIds = (before: { id: string }[], after: { id: string }[]) => {
  const ids = new Set(after.map((item) => item.id));
  return before.every((item) => ids.has(item.id));
};
function applyPermissions(
  current: NetworkRegister,
  incoming: NetworkRegister,
  user: AppUser,
): NetworkRegister {
  if (user.role === "admin") return incoming;
  const currentIds = new Set(current.sites.map((site) => site.id)),
    incomingIds = new Set(incoming.sites.map((site) => site.id));
  if (
    incoming.sites.some(
      (site) => !currentIds.has(site.id) || !canAccessSite(user, site.id),
    )
  )
    throw new Error("permission");
  const allowedCurrent = current.sites.filter((site) =>
    canAccessSite(user, site.id),
  );
  if (allowedCurrent.some((site) => !incomingIds.has(site.id)))
    throw new Error("delete");
  for (const before of allowedCurrent) {
    const after = incoming.sites.find((site) => site.id === before.id)!;
    if (
      !containsAllIds(before.devices, after.devices) ||
      !containsAllIds(before.connections, after.connections) ||
      !containsAllIds(before.ipPlan, after.ipPlan)
    )
      throw new Error("delete");
  }
  return {
    ...current,
    updatedAt: incoming.updatedAt,
    sites: current.sites.map((site) =>
      canAccessSite(user, site.id)
        ? (incoming.sites.find((next) => next.id === site.id) ?? site)
        : site,
    ),
    siteRelationships: current.siteRelationships,
  };
}

async function readRegister(env: Env) {
  const row = await env.DB.prepare(SELECT_REGISTER)
    .bind(REGISTER_ID)
    .first<RegisterRow>();
  if (row) return toLoaded(row);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO register (id, document, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)",
  )
    .bind(REGISTER_ID, JSON.stringify(seedRegister), now, "system:seed")
    .run();

  const seeded = await env.DB.prepare(SELECT_REGISTER)
    .bind(REGISTER_ID)
    .first<RegisterRow>();
  return toLoaded(seeded!);
}

async function writeRegister(
  env: Env,
  register: NetworkRegister,
  expectedVersion: number,
  user: AppUser,
) {
  const current = await env.DB.prepare(SELECT_REGISTER)
    .bind(REGISTER_ID)
    .first<RegisterRow>();
  if (!current) throw new Error("Register is not initialised.");
  if (current.version !== expectedVersion)
    return { conflict: true as const, ...toLoaded(current) };

  const permitted = applyPermissions(
    JSON.parse(current.document) as NetworkRegister,
    register,
    user,
  );
  const version = current.version + 1;
  const updatedAt = new Date().toISOString();

  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO register_revision (register_id, document, version, updated_at, updated_by) SELECT id, document, version, updated_at, updated_by FROM register WHERE id = ? AND version = ?",
    ).bind(REGISTER_ID, expectedVersion),
    env.DB.prepare(
      "UPDATE register SET document = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?",
    ).bind(
      JSON.stringify(permitted),
      version,
      updatedAt,
      user.email,
      REGISTER_ID,
      expectedVersion,
    ),
  ]);

  if (results[1].meta.changes !== 1) {
    const latest = await env.DB.prepare(SELECT_REGISTER)
      .bind(REGISTER_ID)
      .first<RegisterRow>();
    if (!latest) throw new Error("Register is not initialised.");
    return { conflict: true as const, ...toLoaded(latest) };
  }

  return { conflict: false as const, version, updatedAt };
}

// --- Routing ---------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const authResponse = await handleAuth(request, env);
    if (authResponse) return authResponse;

    const user = await sessionUser(request, env);
    if (!user) return json({ error: "Application sign-in required." }, 401);
    const adminResponse = await handleAdmin(request, env, user);
    if (adminResponse) return adminResponse;

    try {
      if (url.pathname === "/api/session" && request.method === "GET") {
        return json({
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          scopeAll: user.scopeAll,
          siteIds: user.siteIds,
          csrfToken: user.csrfToken,
        });
      }

      if (url.pathname === "/api/register" && request.method === "GET") {
        const loaded = await readRegister(env);
        return json({
          ...loaded,
          register: visibleRegister(loaded.register, user),
        });
      }

      if (url.pathname === "/api/register" && request.method === "PUT") {
        if (
          !requireCsrf(request, user) ||
          request.headers.get("Sec-Fetch-Site") === "cross-site"
        )
          return json({ error: "Cross-site writes are not allowed." }, 403);
        if (
          !request.headers
            .get("Content-Type")
            ?.toLowerCase()
            .startsWith("application/json")
        )
          return json({ error: "Content-Type must be application/json." }, 415);
        const contentLength = Number(
          request.headers.get("Content-Length") ?? 0,
        );
        if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
          return json({ error: "Register payload is too large." }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES)
          return json({ error: "Register payload is too large." }, 413);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid JSON payload." }, 400);
        }
        if (!body || typeof body !== "object")
          return json({ error: "Invalid register payload." }, 400);
        const candidate = body as { register?: unknown; version?: unknown };
        if (
          !isNetworkRegister(candidate.register) ||
          !Number.isSafeInteger(candidate.version) ||
          Number(candidate.version) < 1
        )
          return json({ error: "Invalid register payload." }, 400);
        if (registerByteLength(candidate.register) > MAX_REGISTER_BYTES)
          return json({ error: "Register payload is too large." }, 413);

        let result;
        try {
          result = await writeRegister(
            env,
            candidate.register,
            Number(candidate.version),
            user,
          );
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === "permission" || error.message === "delete")
          )
            return json(
              {
                error:
                  error.message === "delete"
                    ? "Staff can edit and publish, but only administrators can delete records."
                    : "You cannot change this location.",
              },
              403,
            );
          throw error;
        }
        if (result.conflict) {
          const latest = visibleRegister(result.register, user);
          return json(
            {
              error: "conflict",
              message: `This register was changed by ${result.updatedBy ?? "someone else"} while you were editing.`,
              register: latest,
              version: result.version,
            },
            409,
          );
        }
        return json({ version: result.version, updatedAt: result.updatedAt });
      }

      if (url.pathname === "/api/publications" && request.method === "GET") {
        const siteId = url.searchParams.get("siteId");
        if (!siteId || !canAccessSite(user, siteId))
          return json({ error: "Not allowed." }, 403);
        const rows = await env.DB.prepare(
          "SELECT id,register_version,release_note,published_at,published_by FROM register_publication WHERE register_id=? AND site_id=? ORDER BY id DESC LIMIT 100",
        )
          .bind(REGISTER_ID, siteId)
          .all();
        return json({ publications: rows.results });
      }
      if (url.pathname === "/api/publications" && request.method === "POST") {
        if (!requireCsrf(request, user))
          return json({ error: "Cross-site writes are not allowed." }, 403);
        const body = await request.json<{
          siteId?: string;
          version?: number;
          releaseNote?: string;
        }>();
        if (
          !body.siteId ||
          !canAccessSite(user, body.siteId) ||
          !Number.isSafeInteger(body.version) ||
          typeof body.releaseNote !== "string" ||
          body.releaseNote.length > 500
        )
          return json({ error: "Invalid publication." }, 400);
        const current = await env.DB.prepare(SELECT_REGISTER)
          .bind(REGISTER_ID)
          .first<RegisterRow>();
        if (!current || current.version !== body.version)
          return json({ error: "conflict" }, 409);
        const register = JSON.parse(current.document) as NetworkRegister,
          site = register.sites.find((item) => item.id === body.siteId);
        if (!site) return json({ error: "Location not found." }, 404);
        const result = await env.DB.prepare(
          "INSERT INTO register_publication (register_id,site_id,document,register_version,release_note,published_at,published_by) VALUES (?,?,?,?,?,?,?)",
        )
          .bind(
            REGISTER_ID,
            site.id,
            JSON.stringify(site),
            current.version,
            body.releaseNote,
            new Date().toISOString(),
            user.email,
          )
          .run();
        return json({
          id: result.meta.last_row_id,
          publishedVersion: current.version,
        });
      }

      const restoreMatch = url.pathname.match(
        /^\/api\/publications\/(\d+)\/restore$/,
      );
      if (restoreMatch && request.method === "POST") {
        if (user.role !== "admin")
          return json(
            { error: "Only administrators can restore a published version." },
            403,
          );
        if (!requireCsrf(request, user))
          return json({ error: "Cross-site writes are not allowed." }, 403);
        const publication = await env.DB.prepare(
          "SELECT site_id,document FROM register_publication WHERE id=? AND register_id=?",
        )
          .bind(Number(restoreMatch[1]), REGISTER_ID)
          .first<{ site_id: string; document: string }>();
        if (!publication)
          return json({ error: "Published version not found." }, 404);
        const current = await env.DB.prepare(SELECT_REGISTER)
          .bind(REGISTER_ID)
          .first<RegisterRow>();
        if (!current)
          return json({ error: "Register is not initialised." }, 409);
        const register = JSON.parse(current.document) as NetworkRegister,
          restored = JSON.parse(publication.document) as Site;
        if (!register.sites.some((site) => site.id === publication.site_id))
          return json({ error: "The location no longer exists." }, 409);
        const next = {
          ...register,
          updatedAt: new Date().toISOString(),
          sites: register.sites.map((site) =>
            site.id === publication.site_id ? restored : site,
          ),
        };
        const result = await writeRegister(env, next, current.version, user);
        return json({ version: result.version });
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error("API error", error);
      return json(
        { error: "The server could not complete this request." },
        500,
      );
    }
  },
};
