import type {
  Cabinet,
  NetworkDevice,
  Site,
  TunnelConfiguration,
} from "../types";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 500) =>
  typeof v === "string" && v.length <= max;
const optionalText = (v: unknown, max = 500) => v === undefined || text(v, max);
const unit = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100;
export function validCabinets(v: unknown): v is Cabinet[] | undefined {
  return (
    v === undefined ||
    (Array.isArray(v) &&
      v.length <= 200 &&
      v.every(
        (c) =>
          object(c) &&
          text(c.id, 200) &&
          !!c.id &&
          text(c.name) &&
          String(c.name).trim() &&
          text(c.room) &&
          unit(c.capacity) &&
          text(c.notes, 4000),
      ) &&
      new Set(v.map((c) => c.id)).size === v.length)
  );
}
export function validTunnel(v: unknown): v is TunnelConfiguration | undefined {
  return (
    v === undefined ||
    (object(v) &&
      text(v.sourceGatewayId, 200) &&
      text(v.targetGatewayId, 200) &&
      text(v.sourceSubnets, 2000) &&
      text(v.targetSubnets, 2000) &&
      [
        "Inter-office only",
        "Internet via source",
        "Internet via target",
      ].includes(String(v.routing)) &&
      text(v.permittedTraffic, 4000))
  );
}
export function validInfrastructureDevice(v: Record<string, unknown>) {
  if (
    ![v.cabinetId, v.hostDeviceId, v.controllerDeviceId].every((x) =>
      optionalText(x, 200),
    )
  )
    return false;
  if (
    v.mounting !== undefined &&
    !["Rack", "Shelf", "Wall", "Desktop", "Virtual"].includes(
      String(v.mounting),
    )
  )
    return false;
  if (
    (v.rackUnit !== undefined && !unit(v.rackUnit)) ||
    (v.rackHeight !== undefined && !unit(v.rackHeight))
  )
    return false;
  if (!optionalText(v.securityLicenceExpiry, 50)) return false;
  if (v.wanInterfaces !== undefined) {
    if (!Array.isArray(v.wanInterfaces) || v.wanInterfaces.length > 8)
      return false;
    for (const w of v.wanInterfaces) {
      if (
        !object(w) ||
        ![
          "Not documented",
          "DHCP / IPoE",
          "PPPoE",
          "Static IP",
          "Bridge",
        ].includes(String(w.method)) ||
        !["Primary", "Backup"].includes(String(w.role)) ||
        !text(w.portId, 200) ||
        !text(w.vlanId, 4) ||
        (w.vlanId !== "" &&
          (!/^\d+$/.test(String(w.vlanId)) ||
            Number(w.vlanId) < 1 ||
            Number(w.vlanId) > 4094)) ||
        ![w.address, w.gateway, w.dns].every((x) => text(x))
      )
        return false;
    }
  }
  if (v.securityFeatures !== undefined) {
    if (!object(v.securityFeatures)) return false;
    for (const [key, f] of Object.entries(v.securityFeatures)) {
      if (
        !["ids", "ips", "webFiltering", "httpsInspection"].includes(key) ||
        !object(f) ||
        !["Not documented", "Enabled", "Disabled"].includes(String(f.status)) ||
        !text(f.details, 10000) ||
        !text(f.lastVerified, 50)
      )
        return false;
    }
  }
  return true;
}
export function placementIssue(
  device: NetworkDevice,
  site: Pick<Site, "devices" | "cabinets">,
): string | undefined {
  const cabinet = site.cabinets?.find((c) => c.id === device.cabinetId);
  if (device.cabinetId && !cabinet) return "Choose an existing cabinet.";
  if (device.mounting === "Virtual" && device.cabinetId)
    return "Virtual devices belong to a host, not directly to a cabinet.";
  if (device.mounting === "Rack" && device.rackUnit) {
    const end = device.rackUnit + (device.rackHeight ?? 1) - 1;
    if (!cabinet) return "Choose a cabinet before assigning rack units.";
    if (end > cabinet.capacity)
      return "The device extends beyond the cabinet capacity.";
    if (
      site.devices.some(
        (d) =>
          d.id !== device.id &&
          d.cabinetId === device.cabinetId &&
          d.mounting === "Rack" &&
          d.rackUnit &&
          d.state === device.state &&
          d.status !== "Removed" &&
          d.lifecycle !== "Retired" &&
          device.status !== "Removed" &&
          device.lifecycle !== "Retired" &&
          d.rackUnit <= end &&
          d.rackUnit + (d.rackHeight ?? 1) - 1 >= device.rackUnit!,
      )
    )
      return "Those rack units are already occupied in this state.";
  }
  for (const key of ["hostDeviceId", "controllerDeviceId"] as const) {
    const id = device[key];
    if (id && (id === device.id || !site.devices.some((d) => d.id === id)))
      return "Choose another existing device for the host or controller.";
    const seen = new Set([device.id]);
    let next = id;
    while (next) {
      if (seen.has(next))
        return "Host or controller assignments cannot form a cycle.";
      seen.add(next);
      next = site.devices.find((d) => d.id === next)?.[key];
    }
  }
  const assigned = new Set<string>();
  for (const w of device.wanInterfaces ?? []) {
    if (
      w.portId &&
      !device.physicalPorts?.some(
        (p) =>
          p.id === w.portId &&
          p.enabled &&
          ["WAN", "WAN/LAN", "DSL"].includes(p.role),
      )
    )
      return "Choose an enabled WAN or DSL port.";
    if (w.portId && assigned.has(w.portId))
      return "Each WAN interface needs a different physical port.";
    if (w.portId) assigned.add(w.portId);
  }
}
export function validPlacement(site: Site) {
  return site.devices.every((d) => !placementIssue(d, site));
}
export function removeCabinet(site: Site, id: string): Site {
  return {
    ...site,
    cabinets: site.cabinets?.filter((c) => c.id !== id),
    devices: site.devices.map((d) =>
      d.cabinetId === id
        ? {
            ...d,
            cabinetId: undefined,
            rackUnit: undefined,
            rackHeight: undefined,
          }
        : d,
    ),
  };
}
export function physicalLocationLabel(
  d: NetworkDevice,
  cabinets: Cabinet[] = [],
) {
  const c = cabinets.find((c) => c.id === d.cabinetId);
  return (
    [
      c && [c.room, c.name].filter(Boolean).join(" / "),
      d.mounting,
      d.mounting === "Rack" && d.rackUnit
        ? `U${d.rackUnit} (${d.rackHeight ?? 1}U)`
        : "",
      d.physicalLocation,
    ]
      .filter(Boolean)
      .join(" · ") || "Not recorded"
  );
}

export function reconcileWanPorts(device: NetworkDevice): NetworkDevice {
  if (!device.wanInterfaces) return device;
  return {
    ...device,
    wanInterfaces: device.wanInterfaces.map((w) =>
      w.portId &&
      !device.physicalPorts?.some(
        (p) =>
          p.id === w.portId &&
          p.enabled &&
          ["WAN", "WAN/LAN", "DSL"].includes(p.role),
      )
        ? { ...w, portId: "" }
        : w,
    ),
  };
}
