# Network Builder

A self-hosted register for documenting client networks: an interactive topology,
an asset register, an IP/VLAN plan, current vs future-state modelling, and a
print-ready management report.

It runs entirely on Cloudflare — Workers for hosting and the API, D1 for shared
storage, and Cloudflare Access for authentication. The app has no login of its
own and stores nothing in the browser; Access decides who gets in, and the
register lives in your D1 database. A typical small team fits comfortably inside
Cloudflare's free tier.

---

## Features

- Drag-and-drop topology on a snapping grid, with labelled connections
- Searchable catalogue of common network components
- Asset register and IP/VLAN plan
- Every record marked Current or Future, and Known, Needs Verification, Planned or Retired
- Management report with a rendered topology diagram, printable to PDF
- Public WAN addresses and management IPs excluded from the report
- Shared multi-user storage with per-save revision history
- Portable JSON import/export

## Requirements

- Node.js 20+
- A Cloudflare account (free tier is enough)
- A domain in that Cloudflare account

---

## Setup

### 1. Install

```bash
git clone https://github.com/YOUR-USER/statefile-network-builder.git
cd statefile-network-builder
npm install
npx wrangler login
```

### 2. Name your deployment

In `wrangler.jsonc`, set `name` to something unique to you. It becomes the
Worker name and the D1 database name in the steps below.

### 3. Create the database

```bash
npx wrangler d1 create network-builder
```

Copy the returned `database_id` into `d1_databases[0].database_id` in
`wrangler.jsonc`, then create the tables:

```bash
npm run db:init
```

### 4. Point it at your domain

Set `routes[0].pattern` in `wrangler.jsonc` to the hostname you want, on a zone
in your Cloudflare account:

```jsonc
"routes": [
  { "pattern": "network.yourdomain.com", "custom_domain": true }
]
```

> **Leave `workers_dev` and `preview_urls` set to `false`.**
> Access can only protect a hostname on a zone you own — it cannot protect a
> `*.workers.dev` or preview URL. Because the app has no login of its own,
> enabling either one publishes an unauthenticated copy of your register.

Deploy once so the hostname exists:

```bash
npm run deploy
```

### 5. Put Cloudflare Access in front

In the Cloudflare dashboard, under **Zero Trust → Access → Applications**:

1. **Add an application** → **Self-hosted**.
2. Set the domain to the hostname from step 4.
3. Add a policy — for a team, *Allow* with an **Emails** or **Email domain** rule.
4. Set the session duration you want. The app signs users out when it expires.
5. Open the application's **Overview** tab and copy the **Application Audience
   (AUD) tag**, and your team domain from **Settings → Custom Pages** (it looks
   like `your-team.cloudflareaccess.com`).

Put both into `vars` in `wrangler.jsonc`:

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
  "ACCESS_AUD": "your-application-audience-tag"
}
```

These are public identifiers, not secrets. The Worker uses them to verify the
Access token on every API request, so requests reaching it by any other route
are still rejected.

### 6. Deploy

```bash
npm run deploy
```

Open your hostname. You will be sent to the Access login, and on first sign-in
the register is seeded from `src/data/seed.ts`.

---

## Customising it

| What | Where |
|---|---|
| Application title | `index.html`, `src/App.tsx` |
| Starting sites and example data | `src/data/seed.ts` |
| Component catalogue | `src/components/DevicePalette.tsx` |
| Report layout and wording | `src/components/Report.tsx` |
| Security headers | `public/_headers` |

## Local development

```bash
npm run dev            # Vite, UI only
npx wrangler dev       # Worker + API
```

`wrangler dev` runs without Access in front, so the API returns 401 to every
request. Use it to exercise the UI and the rejection paths, not the signed-in
flow — that needs a real deployment.

Verify a release with:

```bash
npm run typecheck
npm run build
```

---

## How it works

The register is a single JSON document in D1 with an integer version. The client
reads it on load and sends that version back on save; if someone else has saved
in the meantime the write is rejected with a 409, the browser refreshes to their
version, and the user re-applies their change. Each accepted write snapshots the
document it replaced into `register_revision`.

The browser stores nothing. State is in memory, so closing the tab or reaching
the end of the Access session leaves no register data on the device. Saves are
debounced, and the header shows a save indicator and the signed-in account.

`RegisterRepository` in `src/data/storage.ts` is the persistence boundary. The
shipped implementation talks to the Worker API; another could be dropped in
without touching the UI.

## Security notes

- Access is the only thing standing in front of the app. Keep `workers_dev` and
  `preview_urls` disabled, and review your Access policy before sharing a link.
- Data is encrypted in transit and at rest by Cloudflare. It is not
  end-to-end encrypted — an account administrator can read the D1 database.
- Do not store credentials, VPN keys, passwords or pre-shared keys in the
  register. It is documentation, not a secret store.
- Exported `.network-register.json` files contain the full register in clear
  text. They are gitignored; treat them as client-confidential.
- This is documentation, not live discovery. Verify configuration before relying
  on it operationally.

## Limitations

- One shared register per deployment.
- Last-writer-wins at document level, guarded by version checks — not
  field-level merging.
- No role separation: anyone Access admits can edit.

## Licence

MIT — see [LICENSE](LICENSE).
