import { seedRegister } from './data/seed'
import type { NetworkRegister } from './types'

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
}

const REGISTER_ID = 'default'
const JWKS_TTL_MS = 60 * 60 * 1000

interface AccessClaims { email?: string; sub?: string; exp: number; iss: string; aud: string | string[] }
interface Jwk { kid: string; kty: string; n: string; e: string }
interface RegisterRow { document: string; version: number; updated_at: string; updated_by: string | null }

// --- Access ----------------------------------------------------------------
// Access blocks unauthenticated traffic at the edge; the Worker verifies the
// assertion again so a request arriving by any other path is still refused.

let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null

const b64urlToBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

const b64urlToString = (value: string) => new TextDecoder().decode(b64urlToBytes(value))

async function signingKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!response.ok) throw new Error(`Could not fetch Access signing keys (${response.status})`)

  const { keys } = await response.json<{ keys: Jwk[] }>()
  const imported = new Map<string, CryptoKey>()
  for (const jwk of keys) {
    imported.set(jwk.kid, await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    ))
  }

  jwksCache = { keys: imported, fetchedAt: Date.now() }
  return imported
}

async function verifyAccessJwt(request: Request, env: Env): Promise<AccessClaims | null> {
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1]
  const token = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookie
  if (!token) return null

  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) return null

  let header: { kid?: string; alg?: string }
  let claims: AccessClaims
  try {
    header = JSON.parse(b64urlToString(headerPart))
    claims = JSON.parse(b64urlToString(payloadPart))
  } catch { return null }

  // Pinned: trusting the token's own alg would allow a downgrade to "none".
  if (header.alg !== 'RS256' || !header.kid) return null

  const key = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).get(header.kid)
  if (!key) return null

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!verified) return null

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(env.ACCESS_AUD)) return null
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null

  return claims
}

// --- Register --------------------------------------------------------------

const SELECT_REGISTER = 'SELECT document, version, updated_at, updated_by FROM register WHERE id = ?'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

const toLoaded = (row: RegisterRow) => ({
  register: JSON.parse(row.document) as NetworkRegister,
  version: row.version,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
})

async function readRegister(env: Env) {
  const row = await env.DB.prepare(SELECT_REGISTER).bind(REGISTER_ID).first<RegisterRow>()
  if (row) return toLoaded(row)

  const now = new Date().toISOString()
  await env.DB.prepare('INSERT OR IGNORE INTO register (id, document, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)')
    .bind(REGISTER_ID, JSON.stringify(seedRegister), now, 'system:seed').run()

  const seeded = await env.DB.prepare(SELECT_REGISTER).bind(REGISTER_ID).first<RegisterRow>()
  return toLoaded(seeded!)
}

async function writeRegister(env: Env, register: NetworkRegister, expectedVersion: number, email: string) {
  const current = await env.DB.prepare(SELECT_REGISTER).bind(REGISTER_ID).first<RegisterRow>()
  if (!current) throw new Error('Register is not initialised.')
  if (current.version !== expectedVersion) return { conflict: true as const, ...toLoaded(current) }

  const version = current.version + 1
  const updatedAt = new Date().toISOString()

  await env.DB.batch([
    env.DB.prepare('INSERT INTO register_revision (register_id, document, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)')
      .bind(REGISTER_ID, current.document, current.version, current.updated_at, current.updated_by),
    env.DB.prepare('UPDATE register SET document = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?')
      .bind(JSON.stringify(register), version, updatedAt, email, REGISTER_ID, expectedVersion),
  ])

  return { conflict: false as const, version, updatedAt }
}

// --- Routing ---------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const claims = await verifyAccessJwt(request, env)
    if (!claims) return json({ error: 'Not authenticated.' }, 401)
    const email = claims.email ?? claims.sub ?? 'unknown'

    try {
      if (url.pathname === '/api/session' && request.method === 'GET') {
        return json({ email, expiresAt: claims.exp * 1000 })
      }

      if (url.pathname === '/api/register' && request.method === 'GET') {
        return json(await readRegister(env))
      }

      if (url.pathname === '/api/register' && request.method === 'PUT') {
        const body = await request.json<{ register: NetworkRegister; version: number }>()
        const valid = body?.register?.schemaVersion === 1 && Array.isArray(body.register.sites) && typeof body.version === 'number'
        if (!valid) return json({ error: 'Invalid register payload.' }, 400)

        const result = await writeRegister(env, body.register, body.version, email)
        if (result.conflict) {
          return json({
            error: 'conflict',
            message: `This register was changed by ${result.updatedBy ?? 'someone else'} while you were editing.`,
            register: result.register,
            version: result.version,
          }, 409)
        }
        return json({ version: result.version, updatedAt: result.updatedAt })
      }

      return json({ error: 'Not found.' }, 404)
    } catch (error) {
      console.error('API error', error)
      return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
    }
  },
}
