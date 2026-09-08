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
  | "Access point only";
export type DeviceLifecycle =
  | "Active"
  | "Standby"
  | "Legacy"
  | "Disconnected"
  | "Planned"
  | "Retired";
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
  managementIp: string;
  subnetVlan: string;
  macAddress: string;
  serialNumber: string;
  connectionType: string;
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
export interface Site {
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
export type TopologyNode = Node<NetworkDevice, "networkDevice">;
export type TopologyEdge = Edge<NetworkConnection>;
