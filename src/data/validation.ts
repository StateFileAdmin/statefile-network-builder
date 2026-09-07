import type {
  InfrastructureState,
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
]);
const states = new Set<InfrastructureState>(["Current", "Future"]);
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

function validDevice(value: unknown): value is NetworkDevice {
  return (
    object(value) &&
    requiredText(value.id, 200) &&
    requiredText(value.hostname) &&
    requiredText(value.deviceType) &&
    text(value.manufacturer) &&
    text(value.model) &&
    text(value.managementIp) &&
    text(value.subnetVlan) &&
    text(value.macAddress) &&
    text(value.serialNumber) &&
    text(value.connectionType) &&
    text(value.physicalLocation) &&
    text(value.switchPort) &&
    text(value.notes, 10000) &&
    text(value.lastVerified, 50) &&
    status(value.status) &&
    state(value.state) &&
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
    text(value.connectionType) &&
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
function validSite(value: unknown): value is Site {
  if (
    !object(value) ||
    !requiredText(value.id, 200) ||
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
          !siteIds.has(link.sourceSiteId) || !siteIds.has(link.targetSiteId),
      )
    )
      return false;
  }
  return true;
}

export function registerByteLength(register: NetworkRegister) {
  return new TextEncoder().encode(JSON.stringify(register)).byteLength;
}
