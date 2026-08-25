# Network Design Register

A reusable, client-neutral network documentation application built with React, TypeScript, Vite and React Flow. It provides an interactive topology, asset register, IP address plan, current/future-state modelling, JSON backup and a management-ready PDF report.

## Create a client edition

1. Clone this repository into a client-specific private repository.
2. Change the application title in `src/App.tsx` and `index.html`.
3. Replace `organisation` and the example site in `src/data/seed.ts`.
4. Give each client edition a unique `STORAGE_KEY` in `src/data/storage.ts`.
5. Review the Azure authentication configuration before deployment.

Do not commit client credentials, VPN keys, passwords, confidential exports or production public IP addresses.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

The application stores changes in browser `localStorage`. Records remain available in the same browser until site data is cleared. Use **Export JSON** for portable backups and transfer between devices.

Verify a release with:

```bash
npm run typecheck
npm run build
```

## Features

- Searchable catalogue of common network components
- Draggable, 24-pixel grid-snapped topology nodes
- Editable devices and labelled connections
- Current, future, planned, unverified and retired states
- Asset and IP/VLAN registers
- Full-register JSON import/export
- Management report with public WAN address exclusion
- Browser print/PDF workflow
- Abstract `RegisterRepository` persistence boundary

## Azure Static Web Apps

Deploy the generated `dist/` directory. `public/staticwebapp.config.json` supplies SPA fallback routing, security headers, authenticated-only routes and a Microsoft Entra ID login redirect. Confirm tenant access and roles in Azure before release.

The local repository adapter can later be replaced by an authenticated API backed by Azure SQL, SharePoint Lists or Supabase.
