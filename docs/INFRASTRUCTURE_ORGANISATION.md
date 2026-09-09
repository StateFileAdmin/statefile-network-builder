# Physical organisation and gateway documentation

Implemented locally on 09/09/2026 in the Seneco app and reusable template. These features document network equipment; they do not apply settings to appliances.

## Cabinets and physical placement

Open an office diagram and choose **Cabinets**. Each cabinet belongs to that office, with a room/location, name, capacity (1–100U) and notes. Cabinet changes use **Save cabinets**. Open a device and expand **Location, hosting and advanced configuration**, select its cabinet to autosave the assignment and immediately display its enclosure. Mounting and other advanced changes still use **Save advanced configuration**. Other existing device fields retain autosave.

Membership is explicit, not inferred from where a node is drawn. A labelled rounded enclosure follows the visible members. Drag the enclosure's header to translate all its members together, including members hidden by the current view; links and device IDs are unchanged. Focus its header and use arrow keys to move by one grid step; Escape cancels a pointer drag. **Hide cabinet groups** changes the view only. Existing unassigned layouts are not repositioned.

Physical view lists equipment in each cabinet, sorted by starting rack unit, plus devices outside cabinets. Mounting supports rack, shelf, wall, desktop and virtual equipment. Starting unit and height must fit within capacity. Occupied rack units may not overlap in the same Current/Future state; removed or retired equipment does not reserve space. Reducing capacity below assigned equipment is rejected. Removing a cabinet requires confirmation and clears cabinet/rack assignments while preserving devices, coordinates and cables. Cabinet deletion remains administrator-only at the API as well as in the UI.

## Gateway and security fields

A DSL modem component and **Modem / bridge only** operating mode distinguish modem duties from routing and WAP mode. DSL ports are available alongside WAN/LAN roles. Bridge mode does not trigger the upstream-routing warning.

Advanced configuration can record up to eight WAN interfaces: method, primary/backup role, optional physical WAN/DSL port, VLAN ID, address, upstream gateway and DNS. Methods include DHCP/IPoE, PPPoE, static IP and bridge. VLAN IDs must be 1–4094 when supplied. A physical WAN port cannot be assigned twice. Deleting/disabling/reclassifying a port clears its WAN reference while keeping other WAN documentation.

Firewall and VPN status/notes remain available. IDS, IPS, web filtering and HTTPS inspection each have separate Not documented/Enabled/Disabled states, notes and verification date, plus a security licence-expiry field. Status records what was verified, not a capability inferred from the model. No dedicated password or private-key fields are provided.

Virtual devices can reference a host; devices can reference a management controller. These references are within the same office in this version. Self-reference and cycles are rejected; deleting the referenced device clears its references. A virtual device's physical placement is represented by its host, not a cabinet assignment on the VM.

## Inter-office VPNs

Dashboard site relationships are the single record for each office link. Alongside technology (WireGuard/IPsec/etc.), optional tunnel details identify both gateway devices, both sets of subnets, permitted services, and routing: inter-office only, internet through the from-site, or internet through the to-site.

Office diagrams show derived linked-office cards. A dashed link connects the local gateway when it is assigned. Clicking a card opens the other office; an administrator can click the dashed link to edit the same relationship used by the dashboard. Diagram cards are presentation-only and do not become physical devices or consume ports. Removing a gateway clears its relationship endpoint; changing a relationship's office clears that endpoint selection. The connection remains documented for reassignment. Existing relationship permissions and site visibility remain enforced.

Subnet/policy text is documentation, not an executable routing or firewall rule set. This release does not simulate VPN reachability, detect all subnet conflicts, configure TLS certificates or push appliance configuration.

## Persistence, reports and rollout

All fields are optional additions to schema version 1 and are included in full-register exports, imports and publication snapshots. Existing files without cabinets or new settings remain valid. No SQL migration is required because the existing register document stores the new fields. Reports include physical cabinet labels, hosting/controller names, WAN method/role/VLAN and inspection statuses. WAN addresses, DNS and detailed policy text are deliberately not added to the management report. Printed topology remains the existing network drawing; cabinet membership appears in its asset summary.

Deploy frontend and Worker together: the older Worker rejects the new bridge-mode enum. Once new records have been saved, rolling back to older validators can prevent edits. Export the register before rollout and prefer a compatible code fix over blindly restoring old code or database state. Production was not changed as part of this implementation; Git remotes were not pushed.

## Verification

Run from each app directory:

```sh
npm run typecheck
npm run build
node tests/infrastructure.cjs
node tests/infrastructure-permissions.cjs
node tests/device-configuration.cjs
node tests/device-category-compatibility.cjs
node tests/publication-delete.cjs
node tests/topology-grid.cjs
```

The browser tests use only fictional data in an isolated context and run against the template's local mode. Start its Vite server on port 5210, install/use Playwright with Chromium, then run `tests/infrastructure-browser.mjs` and `tests/infrastructure-vpn-browser.mjs`. Set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is outside this checkout; override `TEST_BASE_URL` if needed. Tests cover group movement and reload, preservation of cables, cabinet removal, export/import, WAN and security persistence, VPN edits shared across views, office navigation, Escape and mobile containment. Screenshots are written to `/tmp/infrastructure-*.png`. Backend permission tests invoke the actual Worker permission function; no live production writes are used.

## Diagram interactions

Individual nodes follow the pointer freely during dragging. Their final position snaps to the 24-unit grid and saves on release; parent updates cannot overwrite live drag positions. Connection handles refresh after node loading and updates so rendering does not depend solely on ResizeObserver notifications. Diagram lines have no text labels; click a line to edit its details.

The Endpoints catalogue includes an Ethernet POS terminal, searchable by POS, EFTPOS and point of sale. Connection type is a plain text field that supports custom values.
