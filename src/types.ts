import type { Edge, Node, XYPosition } from "@xyflow/react";
export type RecordStatus =
  | "Known"
  | "Needs Verification"
  | "Planned"
  | "Retired"
  | "Compromised"
  | "Removed";
export type InfrastructureState = "Current" | "Future";
export type DeviceOperatingMode =
  | "Router only"
  | "Router + wireless access point"
  | "Access point only"
  | "Modem / bridge only";
export type DeviceLifecycle =
  "Active" | "Standby" | "Legacy" | "Disconnected" | "Planned" | "Retired";
export type ConfigurationStatus = "Not documented" | "Enabled" | "Disabled";
export interface DeviceSecurityConfiguration {
  status: ConfigurationStatus;
  details: string;
  lastVerified: string;
}
export interface PhysicalPort {
  id: string;
  label: string;
  role: "LAN" | "WAN" | "WAN/LAN" | "Uplink" | "DSL";
  enabled: boolean;
  notes: string;
}
export interface NetworkDevice extends Record<string, unknown> {
  id: string;
  hostname: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serviceProvider?: string;
  serviceType?: string;
  serviceReference?: string;
  serviceCost?: string;
  wirelessNetworks?: string;
  operatingMode?: DeviceOperatingMode;
  quantity?: number;
  portCount?: number;
  physicalPorts?: PhysicalPort[];
  firewall?: DeviceSecurityConfiguration;
  vpn?: DeviceSecurityConfiguration;
  connectedPorts?: number[];
  disabledPorts?: number[];
  managementIp: string;
  subnetVlan: string;
  macAddress: string;
  serialNumber: string;
  connectionType: string;
  cabinetId?: string;
  mounting?: "Rack" | "Shelf" | "Wall" | "Desktop" | "Virtual";
  rackUnit?: number;
  rackHeight?: number;
  hostDeviceId?: string;
  controllerDeviceId?: string;
  wanInterfaces?: WanConfiguration[];
  securityFeatures?: Partial<
    Record<
      "ids" | "ips" | "webFiltering" | "httpsInspection",
      DeviceSecurityConfiguration
    >
  >;
  securityLicenceExpiry?: string;
  physicalLocation: string;
  switchPort: string;
  notes: string;
  lastVerified: string;
  status: RecordStatus;
  state: InfrastructureState;
  lifecycle?: DeviceLifecycle;
  position: XYPosition;
  removedAt?: string;
}
export interface NetworkConnection extends Record<string, unknown> {
  id: string;
  source: string;
  target: string;
  label: string;
  connectionType: string;
  status: RecordStatus;
  state: InfrastructureState;
  countsTowardPorts?: boolean;
  sourcePortId?: string;
  targetPortId?: string;
  removedAt?: string;
}
export interface IpPlanEntry {
  id: string;
  name: string;
  cidr: string;
  vlanId: string;
  gateway: string;
  dhcpRange: string;
  dnsServers: string;
  purpose: string;
  status: RecordStatus;
  state: InfrastructureState;
  notes: string;
}
export interface Cabinet {
  id: string;
  name: string;
  room: string;
  capacity: number;
  notes: string;
}
export interface WanConfiguration {
  method: "Not documented" | "DHCP / IPoE" | "PPPoE" | "Static IP" | "Bridge";
  role: "Primary" | "Backup";
  portId: string;
  vlanId: string;
  address: string;
  gateway: string;
  dns: string;
}
export interface TunnelConfiguration {
  sourceGatewayId: string;
  targetGatewayId: string;
  sourceSubnets: string;
  targetSubnets: string;
  routing: "Inter-office only" | "Internet via source" | "Internet via target";
  permittedTraffic: string;
}
export interface Site {
  cabinets?: Cabinet[];
  id: string;
  name: string;
  address: string;
  description: string;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  ipPlan: IpPlanEntry[];
  risks: string[];
  plannedImprovements: string[];
}
export interface SiteRelationship {
  tunnel?: TunnelConfiguration;
  id: string;
  sourceSiteId: string;
  targetSiteId: string;
  name: string;
  technology: string;
  notes: string;
  status: RecordStatus;
  state: InfrastructureState;
}
export interface NetworkRegister {
  schemaVersion: 1;
  organisation: string;
  updatedAt: string;
  sites: Site[];
  siteRelationships?: SiteRelationship[];
}
export type TopologyNode = Node<
  NetworkDevice,
  "networkDevice" | "remoteOffice"
>;
export type TopologyEdge = Edge<NetworkConnection>;
