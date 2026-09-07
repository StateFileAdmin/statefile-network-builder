import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { requireCsrf, type AppUser, type AuthEnv } from "./auth";
import type { NetworkRegister } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    },
  });
const hash = async (value: string) =>
  isoBase64URL.fromBuffer(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
const token = () =>
  isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)));
const body = async (request: Request, user: AppUser) => {
  if (!requireCsrf(request, user)) throw new Error("csrf");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new Error("origin");
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("content-type");
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 50_000)
    throw new Error("size");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 50_000)
    throw new Error("size");
  return JSON.parse(raw) as unknown;
};
const emailValid = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function handleAdmin(
  request: Request,
  env: AuthEnv,
  user: AppUser,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/")) return null;
  if (user.role !== "admin")
    return json({ error: "Administrator access required." }, 403);
  try {
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      const users = await env.DB.prepare(
          "SELECT u.id,u.email,u.display_name,u.role,u.scope_all,u.status,u.created_at,COUNT(p.id) AS passkey_count FROM app_user u LEFT JOIN passkey_credential p ON p.user_id=u.id GROUP BY u.id ORDER BY u.display_name",
        ).all(),
        sites = await env.DB.prepare(
          "SELECT user_id,site_id FROM user_site",
        ).all<{ user_id: string; site_id: string }>();
      return json({
        users: users.results.map((item) => ({
          ...item,
          site_ids: sites.results
            .filter((site) => site.user_id === (item as { id: string }).id)
            .map((site) => site.site_id),
        })),
      });
    }
    const resetMatch = url.pathname.match(
      /^\/api\/admin\/users\/([^/]+)\/passkey-reset$/,
    );
    if (resetMatch && request.method === "POST") {
      await body(request, user);
      const targetId = decodeURIComponent(resetMatch[1]);
      const target = await env.DB.prepare(
        "SELECT id,status FROM app_user WHERE id=?",
      )
        .bind(targetId)
        .first<{ id: string; status: string }>();
      if (!target) return json({ error: "Account not found." }, 404);
      if (target.status !== "active")
        return json(
          { error: "Activate the account before resetting its passkeys." },
          409,
        );
      const rawToken = token(),
        created = new Date(),
        expires = new Date(created.getTime() + 60 * 60 * 1000);
      await env.DB.prepare(
        "INSERT INTO passkey_reset (token_hash,user_id,created_at,created_by,expires_at) VALUES (?,?,?,?,?)",
      )
        .bind(
          await hash(rawToken),
          targetId,
          created.toISOString(),
          user.id,
          expires.toISOString(),
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO security_event (event_type,severity,actor_id,route,detail,cf_ray,country,created_at) VALUES ('passkey_reset_issued','critical',?,?,?,?,?,?)",
      )
        .bind(
          user.id,
          url.pathname,
          `target:${targetId}`,
          request.headers.get("CF-Ray"),
          request.headers.get("CF-IPCountry"),
          created.toISOString(),
        )
        .run();
      return json({
        resetUrl: `${url.origin}/#reset/${rawToken}`,
        expiresAt: expires.toISOString(),
      });
    }
    if (url.pathname === "/api/admin/invites" && request.method === "POST") {
      const input = (await body(request, user)) as {
        email?: unknown;
        displayName?: unknown;
        role?: unknown;
        scopeAll?: unknown;
        siteIds?: unknown;
      };
      if (
        typeof input.email !== "string" ||
        !emailValid(input.email) ||
        typeof input.displayName !== "string" ||
        !input.displayName.trim() ||
        !["admin", "staff"].includes(String(input.role)) ||
        typeof input.scopeAll !== "boolean" ||
        !Array.isArray(input.siteIds) ||
        !input.siteIds.every((id) => typeof id === "string")
      )
        return json({ error: "Invalid invitation details." }, 400);
      const existing = await env.DB.prepare(
        "SELECT id FROM app_user WHERE email=?",
      )
        .bind(input.email)
        .first();
      if (existing)
        return json({ error: "An account already uses this email." }, 409);
      const registerRow = await env.DB.prepare(
          "SELECT document FROM register WHERE id='default'",
        ).first<{ document: string }>(),
        validSites = new Set(
          registerRow
            ? (JSON.parse(registerRow.document) as NetworkRegister).sites.map(
                (site) => site.id,
              )
            : [],
        );
      if (input.siteIds.some((id) => !validSites.has(id as string)))
        return json({ error: "An assigned location does not exist." }, 400);
      const rawToken = token(),
        created = new Date(),
        expires = new Date(created.getTime() + 60 * 60 * 1000);
      await env.DB.prepare(
        "INSERT INTO user_invite (token_hash,email,display_name,role,scope_all,site_ids,created_at,created_by,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          await hash(rawToken),
          input.email.toLowerCase(),
          input.displayName.trim(),
          input.role,
          input.role === "admin" || input.scopeAll ? 1 : 0,
          JSON.stringify(
            input.role === "admin" || input.scopeAll ? [] : input.siteIds,
          ),
          created.toISOString(),
          user.id,
          expires.toISOString(),
        )
        .run();
      return json({
        inviteUrl: `${url.origin}/#invite/${rawToken}`,
        expiresAt: expires.toISOString(),
      });
    }
    if (
      url.pathname.startsWith("/api/admin/users/") &&
      request.method === "PATCH"
    ) {
      const targetId = decodeURIComponent(
          url.pathname.slice("/api/admin/users/".length),
        ),
        input = (await body(request, user)) as {
          role?: unknown;
          scopeAll?: unknown;
          siteIds?: unknown;
          status?: unknown;
        };
      if (
        !["admin", "staff"].includes(String(input.role)) ||
        typeof input.scopeAll !== "boolean" ||
        !Array.isArray(input.siteIds) ||
        !input.siteIds.every((id) => typeof id === "string") ||
        !["active", "suspended"].includes(String(input.status))
      )
        return json({ error: "Invalid account changes." }, 400);
      const target = await env.DB.prepare(
        "SELECT role,status FROM app_user WHERE id=?",
      )
        .bind(targetId)
        .first<{ role: string; status: string }>();
      if (!target) return json({ error: "Account not found." }, 404);
      if (
        target.role === "admin" &&
        (input.role !== "admin" || input.status !== "active")
      ) {
        const admins = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM app_user WHERE role='admin' AND status='active'",
        ).first<{ count: number }>();
        if (Number(admins?.count ?? 0) <= 1)
          return json(
            {
              error:
                "The final active administrator cannot be suspended or demoted.",
            },
            409,
          );
      }
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE app_user SET role=?,scope_all=?,status=? WHERE id=?",
        ).bind(
          input.role,
          input.role === "admin" || input.scopeAll ? 1 : 0,
          input.status,
          targetId,
        ),
        env.DB.prepare("DELETE FROM user_site WHERE user_id=?").bind(targetId),
        ...(
          (input.role === "staff" && !input.scopeAll
            ? input.siteIds
            : []) as string[]
        ).map((siteId) =>
          env.DB.prepare(
            "INSERT INTO user_site (user_id,site_id) VALUES (?,?)",
          ).bind(targetId, siteId),
        ),
        ...(input.status === "suspended"
          ? [
              env.DB.prepare(
                "UPDATE app_session SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
              ).bind(new Date().toISOString(), targetId),
            ]
          : []),
      ]);
      return json({ ok: true });
    }
    if (
      url.pathname === "/api/admin/security-events" &&
      request.method === "GET"
    ) {
      const events = await env.DB.prepare(
        "SELECT id,event_type,severity,actor_id,route,detail,cf_ray,country,created_at FROM security_event ORDER BY id DESC LIMIT 200",
      ).all();
      return json({ events: events.results });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Admin API error", error);
    return json(
      { error: "The administrator request could not be completed." },
      400,
    );
  }
}
