import type { NetworkRegister } from "../types";
import { connectionStatusFor } from "./deviceStatus";

// Preserve records and links. VPN nodes remain supported for existing diagrams;
// their endpoints cannot safely be inferred when a node has zero or many links.
export const canonicalDeviceType = (value: string): string => {
  const type = value.trim().toLowerCase();
  if (
    [
      "router",
      "router / wap",
      "router / security gateway",
      "router / gateway",
    ].includes(type)
  )
    return "Router / Gateway";
  if (["firewall", "firewall / ngfw"].includes(type)) return "Firewall";
  return value;
};

export const normaliseDeviceTypes = (register: NetworkRegister) => {
  let changed = false;
  const sites = register.sites.map((site) => ({
    ...site,
    devices: site.devices.map((device) => {
      const type = device.deviceType.trim().toLowerCase(),
        legacyType = type === "wireless network",
        legacyCombinedRouter =
          type.includes("router") &&
          (type.includes("wi-fi") ||
            type.includes("wifi") ||
            type.includes("wireless") ||
            type.includes("wap")),
        canonicalType = canonicalDeviceType(device.deviceType),
        normalisedType = legacyType
          ? "Wireless access point"
          : legacyCombinedRouter
            ? "Router / Gateway"
            : canonicalType,
        operatingMode =
          device.operatingMode ??
          (normalisedType === "Router / Gateway"
            ? legacyCombinedRouter
              ? "Router + wireless access point"
              : "Router only"
            : undefined),
        isInternetService = normalisedType === "Internet service",
        serviceProvider = isInternetService
          ? device.serviceProvider?.trim() || device.manufacturer
          : device.serviceProvider,
        serviceType = isInternetService
          ? device.serviceType?.trim() || device.model
          : device.serviceType,
        needsServiceMigration =
          isInternetService &&
          (serviceProvider !== device.serviceProvider ||
            serviceType !== device.serviceType ||
            Boolean(device.manufacturer || device.model));
      if (
        normalisedType === device.deviceType &&
        !legacyType &&
        !legacyCombinedRouter &&
        operatingMode === device.operatingMode &&
        !needsServiceMigration
      )
        return device;
      changed = true;
      return {
        ...device,
        deviceType: normalisedType,
        operatingMode,
        serviceProvider,
        serviceType,
        manufacturer: isInternetService ? "" : device.manufacturer,
        model: isInternetService ? "" : device.model,
      };
    }),
  }));
  const normalisedSites = sites.map((site) => ({
    ...site,
    connections: site.connections.map((connection) => {
      const source = site.devices.find(
          (device) => device.id === connection.source,
        ),
        target = site.devices.find((device) => device.id === connection.target),
        status = connectionStatusFor(source, target, connection.status);
      if (status === connection.status) return connection;
      changed = true;
      return { ...connection, status };
    }),
  }));
  return changed
    ? {
        ...register,
        sites: normalisedSites,
        updatedAt: new Date().toISOString(),
      }
    : register;
};
