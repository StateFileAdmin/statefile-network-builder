import { tunnelEndpointsValid } from "./siteLinks";
import {
  validInfrastructureDevice,
  validCabinets,
  validTunnel,
  validPlacement,
} from "./infrastructure";
import { physicalPortAssignmentsValid } from "./physicalPorts";
import type {
  InfrastructureState,
  DeviceLifecycle,
  IpPlanEntry,
  NetworkConnection,
  NetworkDevice,
  NetworkRegister,
  RecordStatus,
  Site,
  SiteRelationship,
} from "../types";

export const MAX_REGISTER_BYTES = 1_000_000;
const MAX_SITES = 100,
  MAX_DEVICES_PER_SITE = 5000,
  MAX_CONNECTIONS_PER_SITE = 10000,
  MAX_IP_ENTRIES_PER_SITE = 2000,
  MAX_RELATIONSHIPS = 2000;
const statuses = new Set<RecordStatus>([
  "Known",
  "Needs Verification",
  "Planned",
  "Retired",
  "Compromised",
  "Removed",
]);
const states = new Set<InfrastructureState>(["Current", "Future"]);
const lifecycles = new Set<DeviceLifecycle>([
  "Active",
  "Standby",
  "Legacy",
  "Disconnected",
  "Planned",
  "Retired",
]);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 500) =>
  typeof value === "string" && value.length <= max;
const requiredText = (value: unknown, max = 500) =>
  typeof value === "string" && value.length <= max && value.trim().length > 0;
const status = (value: unknown): value is RecordStatus =>
  typeof value === "string" && statuses.has(value as RecordStatus);
const state = (value: unknown): value is InfrastructureState =>
  typeof value === "string" && states.has(value as InfrastructureState);
const stringList = (value: unknown, maxItems = 500) =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((item) => text(item, 4000));
const portList = (value: unknown) =>
  Array.isArray(value) &&
  value.length <= 96 &&
  value.every((item) => Number.isSafeInteger(item) && item >= 1 && item <= 96);

const securityConfiguration = (value: unknown) =>
  value === undefined ||
  (object(value) &&
    ["Not documented", "Enabled", "Disabled"].includes(String(value.status)) &&
    text(value.details, 10000) &&
    text(value.lastVerified, 50));
const physicalPorts = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length <= 96 &&
    value.every(
      (p) =>
        object(p) &&
        requiredText(p.id, 200) &&
        text(p.label, 100) &&
        ["LAN", "WAN", "WAN/LAN", "Uplink", "DSL"].includes(String(p.role)) &&
        typeof p.enabled === "boolean" &&
        text(p.notes, 2000),
    ) &&
    new Set(value.map((p) => p.id)).size === value.length);

function validDevice(value: unknown): value is NetworkDevice {
  return (
    object(value) &&
    requiredText(value.id, 200) &&
    requiredText(value.hostname) &&
    requiredText(value.deviceType) &&
    validInfrastructureDevice(value) &&
    physicalPorts(value.physicalPorts) &&
    securityConfiguration(value.firewall) &&
    securityConfiguration(value.vpn) &&
    text(value.manufacturer) &&
    text(value.model) &&
    (value.serviceProvider === undefined || text(value.serviceProvider)) &&
    (value.serviceType === undefined || text(value.serviceType)) &&
    (value.serviceReference === undefined || text(value.serviceReference)) &&
    (value.serviceCost === undefined || text(value.serviceCost)) &&
    (value.wirelessNetworks === undefined ||
      text(value.wirelessNetworks, 2000)) &&
    (value.operatingMode === undefined ||
      value.operatingMode === "Router only" ||
      value.operatingMode === "Router + wireless access point" ||
      value.operatingMode === "Access point only" ||
      value.operatingMode === "Modem / bridge only") &&
    (value.quantity === undefined ||
      (typeof value.quantity === "number" &&
        Number.isSafeInteger(value.quantity) &&
        value.quantity >= 1 &&
        value.quantity <= 10000)) &&
    (value.portCount === undefined ||
      (Number.isSafeInteger(value.portCount) &&
        Number(value.portCount) >= 1 &&
        Number(value.portCount) <= 96)) &&
    (value.connectedPorts === undefined || portList(value.connectedPorts)) &&
    (value.disabledPorts === undefined || portList(value.disabledPorts)) &&
    text(value.managementIp) &&
    text(value.subnetVlan) &&
    text(value.macAddress) &&
    text(value.serialNumber) &&
    text(value.connectionType) &&
    text(value.physicalLocation) &&
    text(value.switchPort) &&
    text(value.notes, 10000) &&
    text(value.lastVerified, 50) &&
    (value.removedAt === undefined || text(value.removedAt, 100)) &&
    status(value.status) &&
    state(value.state) &&
    (value.lifecycle === undefined ||
      (typeof value.lifecycle === "string" &&
        lifecycles.has(value.lifecycle as DeviceLifecycle))) &&
    object(value.position) &&
    typeof value.position.x === "number" &&
    Number.isFinite(value.position.x) &&
    Math.abs(value.position.x) <= 1_000_000 &&
    typeof value.position.y === "number" &&
    Number.isFinite(value.position.y) &&
    Math.abs(value.position.y) <= 1_000_000
  );
}
function validConnection(value: unknown): value is NetworkConnection {
  return (
    object(value) &&
    requiredText(value.id, 200) &&
    requiredText(value.source, 200) &&
    requiredText(value.target, 200) &&
    text(value.label) &&
    (value.sourcePortId === undefined ||
      requiredText(value.sourcePortId, 200)) &&
    (value.targetPortId === undefined ||
      requiredText(value.targetPortId, 200)) &&
    text(value.connectionType) &&
    (value.removedAt === undefined || text(value.removedAt, 100)) &&
    (value.countsTowardPorts === undefined ||
      typeof value.countsTowardPorts === "boolean") &&
    status(value.status) &&
    state(value.state)
  );
}
function validIpEntry(value: unknown): value is IpPlanEntry {
  return (
    object(value) &&
    requiredText(value.id, 200) &&
    requiredText(value.name) &&
    text(value.cidr) &&
    text(value.vlanId) &&
    text(value.gateway) &&
    text(value.dhcpRange) &&
    text(value.dnsServers) &&
    text(value.purpose, 2000) &&
    status(value.status) &&
    state(value.state) &&
    text(value.notes, 10000)
  );
}
export function validSite(value: unknown): value is Site {
  if (
    !object(value) ||
    !requiredText(value.id, 200) ||
    !validCabinets(value.cabinets) ||
    !requiredText(value.name) ||
    !text(value.address, 2000) ||
    !text(value.description, 10000) ||
    !Array.isArray(value.devices) ||
    value.devices.length > MAX_DEVICES_PER_SITE ||
    !value.devices.every(validDevice) ||
    !Array.isArray(value.connections) ||
    value.connections.length > MAX_CONNECTIONS_PER_SITE ||
    !value.connections.every(validConnection) ||
    !Array.isArray(value.ipPlan) ||
    value.ipPlan.length > MAX_IP_ENTRIES_PER_SITE ||
    !value.ipPlan.every(validIpEntry) ||
    !stringList(value.risks) ||
    !stringList(value.plannedImprovements)
  )
    return false;
  if (!validPlacement(value as unknown as Site)) return false;
  if (!physicalPortAssignmentsValid(value.devices, value.connections))
    return false;
  const deviceIds = new Set(value.devices.map((device) => device.id));
  if (deviceIds.size !== value.devices.length) return false;
  const connectionIds = new Set(
    value.connections.map((connection) => connection.id),
  );
  if (connectionIds.size !== value.connections.length) return false;
  if (
    value.connections.some(
      (connection) =>
        connection.source === connection.target ||
        !deviceIds.has(connection.source) ||
        !deviceIds.has(connection.target),
    )
  )
    return false;
  return (
    new Set(value.ipPlan.map((entry) => entry.id)).size === value.ipPlan.length
  );
}
function validRelationship(value: unknown): value is SiteRelationship {
  return (
    object(value) &&
    requiredText(value.id, 200) &&
    requiredText(value.sourceSiteId, 200) &&
    requiredText(value.targetSiteId, 200) &&
    value.sourceSiteId !== value.targetSiteId &&
    validTunnel(value.tunnel) &&
    requiredText(value.name) &&
    text(value.technology) &&
    text(value.notes, 10000) &&
    status(value.status) &&
    state(value.state)
  );
}

export function isNetworkRegister(value: unknown): value is NetworkRegister {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    requiredText(value.organisation) === false ||
    !text(value.updatedAt, 100) ||
    !Array.isArray(value.sites) ||
    value.sites.length === 0 ||
    value.sites.length > MAX_SITES ||
    !value.sites.every(validSite)
  )
    return false;
  const siteIds = new Set(value.sites.map((site) => site.id));
  if (siteIds.size !== value.sites.length) return false;
  if (value.siteRelationships !== undefined) {
    if (
      !Array.isArray(value.siteRelationships) ||
      value.siteRelationships.length > MAX_RELATIONSHIPS ||
      !value.siteRelationships.every(validRelationship)
    )
      return false;
    const relationshipIds = new Set(
      value.siteRelationships.map((link) => link.id),
    );
    if (
      relationshipIds.size !== value.siteRelationships.length ||
      value.siteRelationships.some(
        (link) =>
          !siteIds.has(link.sourceSiteId) ||
          !siteIds.has(link.targetSiteId) ||
          !tunnelEndpointsValid(link, { sites: value.sites as Site[] }),
      )
    )
      return false;
  }
  return true;
}

export function registerByteLength(register: NetworkRegister) {
  return new TextEncoder().encode(JSON.stringify(register)).byteLength;
}
