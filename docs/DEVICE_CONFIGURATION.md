# Device configuration and direct port mapping

Implemented locally; not deployed by this change.

## Office router or access point

Select Router / Gateway for a router (including an ER605), or Wireless access point for a standalone AP. For a combined router running as an AP, set Operating mode to Access point only. Record the actual settings; the model does not prove which features are enabled.

In the device editor, add physical ports and label them to match the chassis. Each port has a LAN, WAN, WAN/LAN or Uplink role, enabled state and notes. No patch panel is required. Edit a cable and select its source and target ports. An endpoint without documented ports can remain unassigned.

Existing device IDs, positions and connections remain. Old links are not assigned guessed port numbers. The diagram indicates links needing port assignments. A used port cannot be disabled or removed until its connections are unassigned. Different Current/Future designs may use the same socket; two connections in the same state may not.

## Firewall and VPN

Routers, gateways, firewalls and access points can save separate Firewall and VPN status (Not documented, Enabled, Disabled), configuration notes and last-verified dates. Device records hold these fields directly, so autosave, register snapshots and JSON export/import preserve them. Status starts as Not documented. Turning a feature off preserves its notes.

Use configuration notes for firewall rules/purpose and VPN protocols/tunnel purpose. Use VPN connections between gateways, or existing location relationships for inter-site VPNs. VPN and Wi-Fi links do not consume sockets. Switching a cable to a virtual connection clears its physical assignments; changing an endpoint or Current/Future state also requires reassignment.

Management reports include configuration status and verification dates plus the port-to-device map. Detailed firewall/VPN notes and port notes remain in the technical register/JSON, keeping potentially sensitive free text out of management reports.

## Verification

Run `node tests/device-configuration.cjs` and `node tests/device-category-compatibility.cjs`, then `npm run typecheck` and `npm run build`. Browser verification covers adding a port, assigning a cable, saving/reloading firewall details, blocking removal of occupied ports, switching a cable to VPN and viewing the report.
