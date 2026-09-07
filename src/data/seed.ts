import type { NetworkDevice, NetworkRegister } from "../types";
const device = (
  v: Partial<NetworkDevice> &
    Pick<NetworkDevice, "id" | "hostname" | "deviceType" | "position">,
): NetworkDevice => ({
  manufacturer: "",
  model: "",
  managementIp: "",
  subnetVlan: "",
  macAddress: "",
  serialNumber: "",
  connectionType: "Ethernet",
  physicalLocation: "",
  switchPort: "",
  notes: "",
  lastVerified: "",
  status: "Needs Verification",
  state: "Current",
  ...v,
});
export const seedRegister: NetworkRegister = {
  schemaVersion: 1,
  organisation: "Your Organisation",
  updatedAt: new Date().toISOString(),
  sites: [
    {
      id: "example-site",
      name: "Example Site",
      address: "Replace with the client site address",
      description:
        "Example current-state topology. Rename this site and replace the sample records during initial discovery.",
      devices: [
        device({
          id: "internet",
          hostname: "Internet Service",
          deviceType: "Internet service",
          connectionType: "WAN",
          notes: "Record provider, circuit type and service details.",
          position: { x: 48, y: 192 },
        }),
        device({
          id: "router",
          hostname: "Site Router",
          deviceType: "Router",
          connectionType: "WAN / Ethernet",
          notes:
            "Record gateway, DHCP, DNS, firmware and routing configuration.",
          position: { x: 360, y: 192 },
        }),
        device({
          id: "switch",
          hostname: "Core Switch",
          deviceType: "Managed switch",
          connectionType: "Ethernet / VLAN",
          notes: "Record VLANs, uplinks, PoE capacity and port map.",
          position: { x: 672, y: 192 },
        }),
        device({
          id: "wifi",
          hostname: "Wireless Access Point",
          deviceType: "Wireless access point",
          connectionType: "Ethernet / PoE / Wi-Fi",
          notes: "Record SSIDs, security, channels and controller.",
          position: { x: 984, y: 48 },
        }),
        device({
          id: "clients",
          hostname: "Client Devices",
          deviceType: "Client group",
          connectionType: "Ethernet / Wi-Fi",
          notes:
            "Replace this placeholder with individually documented operational assets as appropriate.",
          position: { x: 984, y: 336 },
        }),
      ],
      connections: [
        {
          id: "c1",
          source: "internet",
          target: "router",
          label: "WAN service",
          connectionType: "WAN",
          status: "Needs Verification",
          state: "Current",
        },
        {
          id: "c2",
          source: "router",
          target: "switch",
          label: "LAN uplink",
          connectionType: "Ethernet",
          status: "Needs Verification",
          state: "Current",
        },
        {
          id: "c3",
          source: "switch",
          target: "wifi",
          label: "PoE uplink",
          connectionType: "Ethernet / PoE",
          status: "Needs Verification",
          state: "Current",
        },
        {
          id: "c4",
          source: "switch",
          target: "clients",
          label: "Client access",
          connectionType: "Ethernet / Wi-Fi",
          status: "Needs Verification",
          state: "Current",
        },
      ],
      ipPlan: [
        {
          id: "primary-lan",
          name: "Primary LAN",
          cidr: "To be captured",
          vlanId: "To be captured",
          gateway: "To be captured",
          dhcpRange: "To be captured",
          dnsServers: "To be captured",
          purpose: "Primary client network",
          status: "Needs Verification",
          state: "Current",
          notes: "Verify during initial discovery.",
        },
      ],
      risks: [
        "Network configuration has not yet been verified.",
        "Asset inventory and connection mapping require client review.",
      ],
      plannedImprovements: [
        "Complete current-state discovery and verification.",
        "Agree the future-state security, segmentation and connectivity design with the client.",
      ],
    },
  ],
};
