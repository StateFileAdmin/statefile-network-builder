import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
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
  SETUP_TOKEN?: string;
}
export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
  scopeAll: boolean;
  siteIds: string[];
  csrfToken: string;
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
const constantTimeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1)
    difference |=
      leftBytes[index % leftBytes.length] ^
      rightBytes[index % rightBytes.length];
  return difference === 0;
};
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
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const parseBody = async (request: Request) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new Error("origin");
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("content-type");
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
    `SELECT u.id,u.email,u.display_name,u.role,u.scope_all,u.status,s.csrf_token FROM app_session s JOIN app_user u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`,
  )
    .bind(tokenHash, nowIso())
    .first<UserRow & { csrf_token: string }>();
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
        setupRequired: Number(count?.count ?? 0) === 0,
        authenticated: Boolean(user),
        user: user && {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          scopeAll: user.scopeAll,
          siteIds: user.siteIds,
        },
        csrfToken: user?.csrfToken,
      });
    }
    if (path === "/api/auth/setup/options" && request.method === "POST") {
      const count = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM app_user",
        ).first<{ count: number }>(),
        body = (await parseBody(request)) as {
          displayName?: unknown;
          email?: unknown;
          setupCode?: unknown;
        };
      if (Number(count?.count ?? 0) !== 0)
        return authJson({ error: "Initial setup is unavailable." }, 403);
      if (!env.SETUP_TOKEN)
        return authJson(
          { error: "Initial setup is not configured by the operator." },
          503,
        );
      const suppliedCode =
        typeof body.setupCode === "string" ? body.setupCode : "";
      if (
        !constantTimeEqual(
          await hash(suppliedCode),
          await hash(env.SETUP_TOKEN),
        )
      ) {
        await securityEvent(env, request, "invalid_setup_token", "critical");
        return authJson({ error: "The setup code is not valid." }, 403);
      }
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
          "INSERT INTO app_bootstrap (id,completed_at) VALUES (1,?)",
        ).bind(created),
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
      await securityEvent(env, request, "honeypot", "critical");
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
