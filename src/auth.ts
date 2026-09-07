import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type Base64URLString,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

export interface AuthEnv {
  DB: D1Database;
  LOGIN_RATE_LIMITER: RateLimit;
  RP_ID: string;
  RP_ORIGIN: string;
  INITIAL_SETUP_ENABLED?: string;
}
export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
  scopeAll: boolean;
  siteIds: string[];
  csrfToken: string;
  expiresAt: string;
}
interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "staff";
  scope_all: number;
  status: string;
}
interface ChallengeRow {
  id: string;
  purpose: string;
  challenge: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  invite_hash: string | null;
  expires_at: string;
  used_at: string | null;
}
interface InviteRow {
  token_hash: string;
  email: string;
  display_name: string;
  role: "admin" | "staff";
  scope_all: number;
  site_ids: string;
  expires_at: string;
  used_at: string | null;
}
interface CredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string;
  device_type: string;
  backed_up: number;
}
interface ResetRow {
  token_hash: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

const SESSION_COOKIE = "nr_session",
  SESSION_SECONDS = 8 * 60 * 60,
  CHALLENGE_SECONDS = 5 * 60;
const randomToken = (bytes = 32) =>
  isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(bytes)));
const hash = async (value: string) =>
  isoBase64URL.fromBuffer(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
const cookie = (request: Request, name: string) =>
  request.headers
    .get("Cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const secureCookie = (token: string, maxAge = SESSION_SECONDS) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const nowIso = () => new Date().toISOString();
const expires = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();
const authJson = (body: unknown, status = 200, headers?: HeadersInit) =>
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
      ...headers,
    },
  });
const parseBody = async (request: Request) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new Error("origin");
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
  if (Number.isFinite(contentLength) && contentLength > 100_000)
    throw new Error("size");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 100_000)
    throw new Error("size");
  return JSON.parse(text) as unknown;
};
const securityEvent = async (
  env: AuthEnv,
  request: Request,
  eventType: string,
  severity: "info" | "warning" | "critical",
  actorId?: string,
  detail = "",
) => {
  await env.DB.prepare(
    "INSERT INTO security_event (event_type,severity,actor_id,route,detail,cf_ray,country,created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      eventType,
      severity,
      actorId ?? null,
      new URL(request.url).pathname,
      detail.slice(0, 500),
      request.headers.get("CF-Ray"),
      request.headers.get("CF-IPCountry"),
      nowIso(),
    )
    .run();
};

export async function sessionUser(
  request: Request,
  env: AuthEnv,
): Promise<AppUser | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hash(token);
  const row = await env.DB.prepare(
    `SELECT u.id,u.email,u.display_name,u.role,u.scope_all,u.status,s.csrf_token,s.expires_at FROM app_session s JOIN app_user u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`,
  )
    .bind(tokenHash, nowIso())
    .first<UserRow & { csrf_token: string; expires_at: string }>();
  if (!row || row.status !== "active") return null;
  const sites = await env.DB.prepare(
    "SELECT site_id FROM user_site WHERE user_id=?",
  )
    .bind(row.id)
    .all<{ site_id: string }>();
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    scopeAll: row.role === "admin" || Boolean(row.scope_all),
    siteIds: sites.results.map((item) => item.site_id),
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
  };
}
export const requireCsrf = (request: Request, user: AppUser) =>
  request.headers.get("Origin") === new URL(request.url).origin &&
  request.headers.get("X-CSRF-Token") === user.csrfToken;

async function createSession(env: AuthEnv, userId: string) {
  const token = randomToken(),
    csrfToken = randomToken(),
    created = nowIso();
  await env.DB.prepare(
    "INSERT INTO app_session (token_hash,user_id,csrf_token,created_at,expires_at,last_seen) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      await hash(token),
      userId,
      csrfToken,
      created,
      expires(SESSION_SECONDS),
      created,
    )
    .run();
  return { token, csrfToken };
}
async function storeChallenge(
  env: AuthEnv,
  purpose: "setup" | "login" | "invite" | "add-passkey",
  challenge: string,
  userId?: string,
  email?: string,
  displayName?: string,
  inviteHash?: string,
) {
  const id = randomToken(18);
  await env.DB.prepare(
    "INSERT INTO auth_challenge (id,purpose,challenge,user_id,email,display_name,invite_hash,expires_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      purpose,
      challenge,
      userId ?? null,
      email ?? null,
      displayName ?? null,
      inviteHash ?? null,
      expires(CHALLENGE_SECONDS),
    )
    .run();
  return id;
}
async function takeChallenge(env: AuthEnv, id: string, purpose: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM auth_challenge WHERE id=? AND purpose=? AND used_at IS NULL AND expires_at>?",
  )
    .bind(id, purpose, nowIso())
    .first<ChallengeRow>();
  if (!row) return null;
  const result = await env.DB.prepare(
    "UPDATE auth_challenge SET used_at=? WHERE id=? AND used_at IS NULL",
  )
    .bind(nowIso(), id)
    .run();
  return result.meta.changes === 1 ? row : null;
}

export async function handleAuth(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/auth/")) return null;
  if (request.method === "POST") {
    const rateKey = `${path}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
      limited = !(await env.LOGIN_RATE_LIMITER.limit({ key: rateKey })).success;
    if (limited) {
      await securityEvent(env, request, "rate_limit", "warning");
      return authJson({ error: "Too many attempts. Try again shortly." }, 429);
    }
  }
  try {
    if (path === "/api/auth/status" && request.method === "GET") {
      const user = await sessionUser(request, env),
        count = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM app_user",
        ).first<{ count: number }>();
      return authJson({
        setupRequired:
          env.INITIAL_SETUP_ENABLED === "true" &&
          Number(count?.count ?? 0) === 0,
        standaloneSetup: true,
        authenticated: Boolean(user),
        accessEmail: null,
        user: user && {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          scopeAll: user.scopeAll,
          siteIds: user.siteIds,
        },
        csrfToken: user?.csrfToken,
        expiresAt: user?.expiresAt,
      });
    }
    if (path === "/api/auth/passkeys" && request.method === "GET") {
      const user = await sessionUser(request, env);
      if (!user) return authJson({ error: "Sign-in required." }, 401);
      const credentials = await env.DB.prepare(
        "SELECT id,device_type,backed_up,created_at,last_used_at FROM passkey_credential WHERE user_id=? ORDER BY created_at",
      )
        .bind(user.id)
        .all();
      return authJson({ passkeys: credentials.results });
    }
    if (path === "/api/auth/passkeys/options" && request.method === "POST") {
      const user = await sessionUser(request, env);
      if (!user || !requireCsrf(request, user))
        return authJson({ error: "Sign-in required." }, 401);
      await parseBody(request);
      const credentials = await env.DB.prepare(
        "SELECT id,transports FROM passkey_credential WHERE user_id=?",
      )
        .bind(user.id)
        .all<{ id: string; transports: string }>();
      if (credentials.results.length >= 10)
        return authJson(
          { error: "Remove an old passkey before adding another." },
          409,
        );
      const options = await generateRegistrationOptions({
        rpName: "Network Builder",
        rpID: env.RP_ID,
        userID: new TextEncoder().encode(user.id) as Uint8Array<ArrayBuffer>,
        userName: user.email,
        userDisplayName: user.displayName,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        excludeCredentials: credentials.results.map((credential) => ({
          id: credential.id,
          transports: JSON.parse(
            credential.transports,
          ) as AuthenticatorTransport[],
        })),
        timeout: 120000,
      });
      const challengeId = await storeChallenge(
        env,
        "add-passkey",
        options.challenge,
        user.id,
      );
      return authJson({ options, challengeId });
    }
    if (path === "/api/auth/passkeys/verify" && request.method === "POST") {
      const user = await sessionUser(request, env);
      if (!user || !requireCsrf(request, user))
        return authJson({ error: "Sign-in required." }, 401);
      const body = (await parseBody(request)) as {
        challengeId?: unknown;
        response?: RegistrationResponseJSON;
      };
      if (typeof body.challengeId !== "string" || !body.response)
        return authJson({ error: "Invalid passkey response." }, 400);
      const challenge = await takeChallenge(
        env,
        body.challengeId,
        "add-passkey",
      );
      if (!challenge || challenge.user_id !== user.id || challenge.invite_hash)
        return authJson({ error: "Passkey setup expired." }, 400);
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.RP_ORIGIN,
        expectedRPID: env.RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified)
        return authJson({ error: "Passkey verification failed." }, 400);
      const credential = verification.registrationInfo.credential;
      await env.DB.prepare(
        "INSERT INTO passkey_credential (id,user_id,public_key,counter,transports,device_type,backed_up,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
        .bind(
          credential.id,
          user.id,
          isoBase64URL.fromBuffer(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
          verification.registrationInfo.credentialDeviceType,
          verification.registrationInfo.credentialBackedUp ? 1 : 0,
          nowIso(),
        )
        .run();
      await securityEvent(env, request, "passkey_added", "info", user.id);
      return authJson({ verified: true });
    }
    const passkeyDelete = path.match(/^\/api\/auth\/passkeys\/([^/]+)$/);
    if (passkeyDelete && request.method === "DELETE") {
      const user = await sessionUser(request, env);
      if (!user || !requireCsrf(request, user))
        return authJson({ error: "Sign-in required." }, 401);
      const result = await env.DB.prepare(
        "DELETE FROM passkey_credential WHERE id=? AND user_id=? AND EXISTS (SELECT 1 FROM passkey_credential other WHERE other.user_id=? AND other.id<>?)",
      )
        .bind(
          decodeURIComponent(passkeyDelete[1]),
          user.id,
          user.id,
          decodeURIComponent(passkeyDelete[1]),
        )
        .run();
      if (result.meta.changes !== 1)
        return authJson(
          { error: "Passkey not found, or it is your final passkey." },
          409,
        );
      await securityEvent(env, request, "passkey_removed", "warning", user.id);
      return authJson({ ok: true });
    }
    if (path === "/api/auth/reset/options" && request.method === "POST") {
      const body = (await parseBody(request)) as { token?: unknown };
      if (typeof body.token !== "string")
        return authJson(
          { error: "This reset link is invalid or expired." },
          400,
        );
      const tokenHash = await hash(body.token);
      const reset = await env.DB.prepare(
        "SELECT * FROM passkey_reset WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
      )
        .bind(tokenHash, nowIso())
        .first<ResetRow>();
      if (!reset)
        return authJson(
          { error: "This reset link is invalid or expired." },
          400,
        );
      const target = await env.DB.prepare(
        "SELECT * FROM app_user WHERE id=? AND status='active'",
      )
        .bind(reset.user_id)
        .first<UserRow>();
      if (!target) return authJson({ error: "Account unavailable." }, 400);
      const options = await generateRegistrationOptions({
        rpName: "Network Builder",
        rpID: env.RP_ID,
        userID: new TextEncoder().encode(target.id) as Uint8Array<ArrayBuffer>,
        userName: target.email,
        userDisplayName: target.display_name,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        timeout: 120000,
      });
      const challengeId = await storeChallenge(
        env,
        "add-passkey",
        options.challenge,
        target.id,
        target.email,
        target.display_name,
        tokenHash,
      );
      return authJson({
        options,
        challengeId,
        displayName: target.display_name,
      });
    }
    if (path === "/api/auth/reset/verify" && request.method === "POST") {
      const body = (await parseBody(request)) as {
        challengeId?: unknown;
        response?: RegistrationResponseJSON;
      };
      if (typeof body.challengeId !== "string" || !body.response)
        return authJson({ error: "Passkey reset failed." }, 400);
      const challenge = await takeChallenge(
        env,
        body.challengeId,
        "add-passkey",
      );
      if (!challenge?.user_id || !challenge.invite_hash)
        return authJson({ error: "Passkey reset expired." }, 400);
      const reset = await env.DB.prepare(
        "SELECT * FROM passkey_reset WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?",
      )
        .bind(challenge.invite_hash, challenge.user_id, nowIso())
        .first<ResetRow>();
      if (!reset) return authJson({ error: "Passkey reset expired." }, 400);
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.RP_ORIGIN,
        expectedRPID: env.RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified)
        return authJson({ error: "Passkey verification failed." }, 400);
      const claimed = await env.DB.prepare(
        "UPDATE passkey_reset SET used_at=? WHERE token_hash=? AND used_at IS NULL",
      )
        .bind(nowIso(), reset.token_hash)
        .run();
      if (claimed.meta.changes !== 1)
        return authJson({ error: "Passkey reset already used." }, 409);
      const credential = verification.registrationInfo.credential,
        created = nowIso();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM passkey_credential WHERE user_id=?").bind(
          reset.user_id,
        ),
        env.DB.prepare(
          "INSERT INTO passkey_credential (id,user_id,public_key,counter,transports,device_type,backed_up,created_at) VALUES (?,?,?,?,?,?,?,?)",
        ).bind(
          credential.id,
          reset.user_id,
          isoBase64URL.fromBuffer(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
          verification.registrationInfo.credentialDeviceType,
          verification.registrationInfo.credentialBackedUp ? 1 : 0,
          created,
        ),
        env.DB.prepare(
          "UPDATE app_session SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
        ).bind(created, reset.user_id),
      ]);
      const session = await createSession(env, reset.user_id);
      await securityEvent(
        env,
        request,
        "passkeys_reset",
        "critical",
        reset.user_id,
      );
      return authJson({ verified: true, csrfToken: session.csrfToken }, 200, {
        "Set-Cookie": secureCookie(session.token),
      });
    }
    if (path === "/api/auth/setup/options" && request.method === "POST") {
      if (env.INITIAL_SETUP_ENABLED !== "true")
        return authJson({ error: "Initial setup is unavailable." }, 403);
      const count = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM app_user",
        ).first<{ count: number }>(),
        body = (await parseBody(request)) as {
          displayName?: unknown;
          email?: unknown;
        };
      if (Number(count?.count ?? 0) !== 0)
        return authJson({ error: "Initial setup is unavailable." }, 403);
      const identifier =
        typeof body.email === "string" ? body.email.trim() : "";
      if (
        identifier.length < 2 ||
        identifier.length > 254 ||
        typeof body.displayName !== "string" ||
        body.displayName.trim() !== identifier
      )
        return authJson({ error: "Enter a valid name or email." }, 400);
      const userId = crypto.randomUUID(),
        options = await generateRegistrationOptions({
          rpName: "Network Builder",
          rpID: env.RP_ID,
          userID: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>,
          userName: identifier,
          userDisplayName: identifier,
          attestationType: "none",
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 120000,
        });
      const challengeId = await storeChallenge(
        env,
        "setup",
        options.challenge,
        userId,
        identifier,
        identifier,
      );
      return authJson({ options, challengeId });
    }
    if (path === "/api/auth/setup/verify" && request.method === "POST") {
      if (env.INITIAL_SETUP_ENABLED !== "true")
        return authJson({ error: "Initial setup is unavailable." }, 403);
      const body = (await parseBody(request)) as {
        challengeId?: unknown;
        response?: unknown;
      };
      if (typeof body?.challengeId !== "string" || !body.response)
        return authJson({ error: "Invalid setup response." }, 400);
      const challenge = await takeChallenge(env, body.challengeId, "setup");
      if (
        !challenge ||
        !challenge.user_id ||
        !challenge.email ||
        !challenge.display_name
      )
        return authJson({ error: "Setup expired. Start again." }, 400);
      const verification = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.RP_ORIGIN,
        expectedRPID: env.RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified)
        return authJson({ error: "Passkey verification failed." }, 400);
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM app_user",
      ).first<{ count: number }>();
      if (Number(count?.count ?? 0) !== 0)
        return authJson({ error: "Initial setup is already complete." }, 409);
      const created = nowIso(),
        credential = verification.registrationInfo.credential;
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO app_user (id,email,display_name,role,scope_all,status,created_at,created_by) VALUES (?,?,?,'admin',1,'active',?,?)",
        ).bind(
          challenge.user_id,
          challenge.email,
          challenge.display_name,
          created,
          challenge.user_id,
        ),
        env.DB.prepare(
          "INSERT INTO passkey_credential (id,user_id,public_key,counter,transports,device_type,backed_up,created_at) VALUES (?,?,?,?,?,?,?,?)",
        ).bind(
          credential.id,
          challenge.user_id,
          isoBase64URL.fromBuffer(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
          verification.registrationInfo.credentialDeviceType,
          verification.registrationInfo.credentialBackedUp ? 1 : 0,
          created,
        ),
      ]);
      const session = await createSession(env, challenge.user_id);
      await securityEvent(
        env,
        request,
        "initial_admin_created",
        "critical",
        challenge.user_id,
      );
      return authJson({ verified: true, csrfToken: session.csrfToken }, 200, {
        "Set-Cookie": secureCookie(session.token),
      });
    }
    if (path === "/api/auth/invite/options" && request.method === "POST") {
      const body = (await parseBody(request)) as { token?: unknown };
      if (typeof body?.token !== "string")
        return authJson(
          { error: "This invitation is invalid or expired." },
          400,
        );
      const tokenHash = await hash(body.token),
        invite = await env.DB.prepare(
          "SELECT * FROM user_invite WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
        )
          .bind(tokenHash, nowIso())
          .first<InviteRow>();
      if (!invite)
        return authJson(
          { error: "This invitation is invalid or expired." },
          400,
        );
      const existing = await env.DB.prepare(
        "SELECT id FROM app_user WHERE email=?",
      )
        .bind(invite.email)
        .first();
      if (existing)
        return authJson(
          { error: "This invitation has already been used." },
          409,
        );
      const userId = crypto.randomUUID(),
        options = await generateRegistrationOptions({
          rpName: "Network Builder",
          rpID: env.RP_ID,
          userID: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>,
          userName: invite.email,
          userDisplayName: invite.display_name,
          attestationType: "none",
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          timeout: 120000,
        });
      const challengeId = await storeChallenge(
        env,
        "invite",
        options.challenge,
        userId,
        invite.email,
        invite.display_name,
        invite.token_hash,
      );
      return authJson({
        options,
        challengeId,
        displayName: invite.display_name,
      });
    }
    if (path === "/api/auth/invite/verify" && request.method === "POST") {
      const body = (await parseBody(request)) as {
        challengeId?: unknown;
        response?: unknown;
      };
      if (typeof body?.challengeId !== "string" || !body.response)
        return authJson({ error: "Invitation setup failed." }, 400);
      const challenge = await takeChallenge(env, body.challengeId, "invite");
      if (
        !challenge?.user_id ||
        !challenge.email ||
        !challenge.display_name ||
        !challenge.invite_hash
      )
        return authJson({ error: "Invitation expired. Start again." }, 400);
      const invite = await env.DB.prepare(
        "SELECT * FROM user_invite WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
      )
        .bind(challenge.invite_hash, nowIso())
        .first<InviteRow>();
      if (!invite)
        return authJson({ error: "Invitation expired. Start again." }, 400);
      const verification = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.RP_ORIGIN,
        expectedRPID: env.RP_ID,
        requireUserVerification: true,
      });
      if (!verification.verified)
        return authJson({ error: "Passkey verification failed." }, 400);
      const created = nowIso(),
        credential = verification.registrationInfo.credential,
        siteIds = JSON.parse(invite.site_ids) as string[],
        statements = [
          env.DB.prepare(
            "INSERT INTO app_user (id,email,display_name,role,scope_all,status,created_at,created_by) VALUES (?,?,?,?,?,'active',?,?)",
          ).bind(
            challenge.user_id,
            invite.email,
            invite.display_name,
            invite.role,
            invite.scope_all,
            created,
            invite.email,
          ),
          env.DB.prepare(
            "INSERT INTO passkey_credential (id,user_id,public_key,counter,transports,device_type,backed_up,created_at) VALUES (?,?,?,?,?,?,?,?)",
          ).bind(
            credential.id,
            challenge.user_id,
            isoBase64URL.fromBuffer(credential.publicKey),
            credential.counter,
            JSON.stringify(credential.transports ?? []),
            verification.registrationInfo.credentialDeviceType,
            verification.registrationInfo.credentialBackedUp ? 1 : 0,
            created,
          ),
          env.DB.prepare(
            "UPDATE user_invite SET used_at=? WHERE token_hash=? AND used_at IS NULL",
          ).bind(created, invite.token_hash),
          ...siteIds.map((siteId) =>
            env.DB.prepare(
              "INSERT INTO user_site (user_id,site_id) VALUES (?,?)",
            ).bind(challenge.user_id, siteId),
          ),
        ];
      await env.DB.batch(statements);
      const session = await createSession(env, challenge.user_id);
      await securityEvent(
        env,
        request,
        "invite_accepted",
        "info",
        challenge.user_id,
      );
      return authJson({ verified: true, csrfToken: session.csrfToken }, 200, {
        "Set-Cookie": secureCookie(session.token),
      });
    }
    if (path === "/api/auth/login/options" && request.method === "POST") {
      await parseBody(request);
      const options = await generateAuthenticationOptions({
        rpID: env.RP_ID,
        userVerification: "required",
        allowCredentials: [],
        timeout: 120000,
      });
      const challengeId = await storeChallenge(env, "login", options.challenge);
      return authJson({ options, challengeId });
    }
    if (path === "/api/auth/login/verify" && request.method === "POST") {
      const body = (await parseBody(request)) as {
        challengeId?: unknown;
        response?: AuthenticationResponseJSON;
      };
      if (
        typeof body?.challengeId !== "string" ||
        !body.response ||
        typeof body.response.id !== "string"
      )
        return authJson({ error: "Sign-in failed." }, 400);
      const challenge = await takeChallenge(env, body.challengeId, "login"),
        credential = await env.DB.prepare(
          "SELECT * FROM passkey_credential WHERE id=?",
        )
          .bind(body.response.id)
          .first<CredentialRow>();
      if (!challenge || !credential) {
        await securityEvent(env, request, "unknown_passkey", "warning");
        return authJson({ error: "Sign-in failed." }, 400);
      }
      const user = await env.DB.prepare(
        "SELECT * FROM app_user WHERE id=? AND status='active'",
      )
        .bind(credential.user_id)
        .first<UserRow>();
      if (!user) return authJson({ error: "Sign-in failed." }, 400);
      const stored: WebAuthnCredential = {
        id: credential.id as Base64URLString,
        publicKey: isoBase64URL.toBuffer(credential.public_key),
        counter: credential.counter,
        transports: JSON.parse(credential.transports) as string[],
      };
      const verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: env.RP_ORIGIN,
        expectedRPID: env.RP_ID,
        credential: stored,
        requireUserVerification: true,
      });
      if (!verification.verified) {
        await securityEvent(
          env,
          request,
          "passkey_failure",
          "warning",
          user.id,
        );
        return authJson({ error: "Sign-in failed." }, 400);
      }
      await env.DB.prepare(
        "UPDATE passkey_credential SET counter=?,last_used_at=? WHERE id=?",
      )
        .bind(
          verification.authenticationInfo.newCounter,
          nowIso(),
          credential.id,
        )
        .run();
      const session = await createSession(env, user.id);
      await securityEvent(env, request, "login_success", "info", user.id);
      return authJson({ verified: true, csrfToken: session.csrfToken }, 200, {
        "Set-Cookie": secureCookie(session.token),
      });
    }
    if (path === "/api/auth/logout" && request.method === "POST") {
      const user = await sessionUser(request, env),
        token = cookie(request, SESSION_COOKIE);
      if (user && token && requireCsrf(request, user))
        await env.DB.prepare(
          "UPDATE app_session SET revoked_at=? WHERE token_hash=?",
        )
          .bind(nowIso(), await hash(token))
          .run();
      return authJson({ ok: true }, 200, { "Set-Cookie": secureCookie("", 0) });
    }
    if (
      path === "/api/auth/canary" ||
      path === "/api/auth/password" ||
      path === "/api/auth/admin-login"
    ) {
      const canRecord = (
        await env.LOGIN_RATE_LIMITER.limit({
          key: `honeypot:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
        })
      ).success;
      if (canRecord) await securityEvent(env, request, "honeypot", "critical");
      return authJson({ error: "Not found." }, 404);
    }
    return authJson({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Auth error", error);
    await securityEvent(env, request, "auth_error", "warning");
    return authJson(
      { error: "The authentication request could not be completed." },
      400,
    );
  }
}
