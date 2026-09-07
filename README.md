# Network Builder

Network Builder is an open-source register for documenting network topology, assets, IP/VLAN plans, site relationships, current and future state, and management reports. It documents networks; it does not discover or monitor them.

## Choose how to run it

### Local mode

Use this when one person works in one browser. No account or Cloudflare service is required. Data remains in that browser's local storage.

```bash
npm install
npm run dev
```

Export a register package regularly. Clearing browser storage, using another browser profile, or losing the device can otherwise remove the local copy.

Build static files with `npm run build`. The resulting `dist/` directory can be served by any static web server, but its data still belongs to each browser rather than the host.

### Cloudflare mode

Use this for shared locations, accounts, passkeys, permissions, D1 storage, revision history and publication checkpoints.

```bash
npm install
npx wrangler login
npm run build:cloud
```

Continue with [Cloudflare deployment](docs/CLOUDFLARE_DEPLOYMENT.md).

## Features

- Drag-and-drop topology with labelled relationships, multi-select movement, quick-attached nodes and a canvas context menu
- Location dashboard and inter-site VPN/dependency mapping
- Asset and IP/VLAN registers
- Current and future-state modelling
- Known, verification, planned, retired, compromised and removed states
- Autosaved drafts, direct publishing and restorable publication history
- Printable management reports
- Portable JSON import and export
- Optional passkey-only accounts, eight-hour sessions, multiple passkeys and administrator-managed recovery
- Selected-location or all-location staff access

## Security boundary

Do not store passwords, private keys, VPN pre-shared keys, recovery codes, SNMP community strings, exposed management URLs or other authentication secrets. Network topology, private IP addresses, MAC addresses and VLANs are still confidential operational data.

The hosted mode includes passkeys, server sessions, CSRF checks, input validation, optimistic concurrency, rate limiting, security events and restrictive browser headers. It does not provide end-to-end encryption: a Cloudflare account administrator with D1 access can read stored registers.

Read [Security](SECURITY.md) before hosting the application or accepting untrusted users.

## Commands

| Command                  | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Local browser-storage development          |
| `npm run build`          | Local static production build              |
| `npm run build:cloud`    | Cloudflare/API production build            |
| `npm run dev:cloud`      | Build cloud mode, then run Worker locally  |
| `npm run db:init:local`  | Initialise local D1                        |
| `npm run db:init:remote` | Initialise production D1                   |
| `npm run typecheck`      | Check browser and Worker TypeScript        |
| `npm run verify`         | Run formatting, type and both build checks |
| `npm run deploy`         | Build cloud mode and deploy with Wrangler  |

## Customisation

| Change                   | File                                                       |
| ------------------------ | ---------------------------------------------------------- |
| Initial example register | `src/data/seed.ts`                                         |
| Application title        | `index.html`, `src/App.tsx`, `src/components/AuthGate.tsx` |
| Component catalogue      | `src/components/DevicePalette.tsx`                         |
| Report wording           | `src/components/Report.tsx`                                |
| Browser headers          | `public/_headers`                                          |
| Cloudflare resources     | `wrangler.jsonc`                                           |

## Data model

The register is one versioned JSON document. Hosted writes include the version that was read; stale writes receive `409 Conflict` rather than overwriting another editor. Every accepted write snapshots the previous document. Publishing creates a named per-location checkpoint without disabling draft autosave.

## Licence

MIT. See [LICENSE](LICENSE).
