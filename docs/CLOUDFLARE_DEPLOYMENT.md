# Cloudflare deployment

This deployment uses Workers Static Assets, a Worker API and D1. Authentication is provided by the application's passkey system. Cloudflare Access may remain as an optional additional outer gate, but the application does not depend on Access identity.

## 1. Create D1

```bash
npx wrangler d1 create network-builder
```

Copy the returned database ID into `wrangler.jsonc`.

## 2. Configure the hostname

Replace these example values in `wrangler.jsonc`:

- `routes[0].pattern`
- `vars.RP_ID`
- `vars.RP_ORIGIN`

`RP_ID` is the hostname only. `RP_ORIGIN` is the exact HTTPS origin. Passkeys are bound to these values, so changing the hostname later requires users to register new passkeys.

Keep `workers_dev` and `preview_urls` disabled. This avoids unmanaged alternative hostnames and keeps the passkey relying-party boundary explicit.

The rate-limit namespace ID only needs to be a unique integer within your Cloudflare account. Change `1001` if it is already used by another binding.

## 3. Initialise the database

```bash
npm run db:init:remote
```

The schema is additive and may be run again. Back up an existing deployment before applying future migrations.

## 4. Deploy

```bash
npm run deploy
```

Initial administrator enrolment is disabled by default. Temporarily set `vars.INITIAL_SETUP_ENABLED` to `"true"` in `wrangler.jsonc` and deploy again:

```bash
npm run deploy
```

Open the application at its normal URL and create the first administrator passkey. As soon as enrolment succeeds, return `INITIAL_SETUP_ENABLED` to `"false"` and deploy once more:

```bash
npm run deploy
```

Keep the hostname private until this is complete. The server permits initial enrolment only while the flag is enabled and no account exists; after the first administrator is created, further setup requests are rejected regardless of the flag.

## 5. Create recovery and staff access

Create a second administrator before inviting staff. Administrators generate one-hour, single-use invitation links and send them through an existing trusted channel; SMTP is not required. Issuing a replacement invitation for the same email revokes earlier unused links.

Staff may be assigned every location or selected locations. Staff can edit and publish assigned locations. Server-side policy prevents staff from deleting records, restoring publications, importing or exporting the full register, or managing people.

## 6. Optional Cloudflare Access

Access can be placed in front of the custom hostname as an independent outer gate. Configure it as a self-hosted application or Worker-level Access policy. Test the application passkey login separately; Access sessions and application sessions have independent lifetimes.

## Operations

Before each release:

```bash
npm ci
npm run verify
npx wrangler deploy --dry-run
npx wrangler deployments status
```

Deploy with `npm run deploy`, record the returned version ID, and test login, load, edit, autosave, publish and logout. View live errors with `npx wrangler tail`.

Rollback:

```bash
npx wrangler rollback VERSION_ID
```

D1 data is not rolled back with Worker code. Export or otherwise back up production D1 according to your retention requirements before schema changes.
