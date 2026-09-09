import type { NetworkConnection, NetworkDevice } from "../types";
import { usesPhysicalPort } from "./connectionTypes";

export const portConnections = (
  deviceId: string,
  portId: string,
  connections: NetworkConnection[],
) =>
  connections.filter(
    (c) =>
      c.status !== "Removed" &&
      usesPhysicalPort(c) &&
      ((c.source === deviceId && c.sourcePortId === portId) ||
        (c.target === deviceId && c.targetPortId === portId)),
  );

export const physicalPortAssignmentsValid = (
  devices: NetworkDevice[],
  connections: NetworkConnection[],
) => {
  const occupied = new Set<string>();
  for (const c of connections) {
    if (c.status === "Removed") continue;
    if (!usesPhysicalPort(c) && (c.sourcePortId || c.targetPortId))
      return false;
    for (const [deviceId, portId] of [
      [c.source, c.sourcePortId],
      [c.target, c.targetPortId],
    ]) {
      if (!portId) continue;
      const port = devices
        .find((d) => d.id === deviceId)
        ?.physicalPorts?.find((p) => p.id === portId);
      const key = JSON.stringify([deviceId, portId, c.state]);
      if (!port || !port.enabled || occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  return true;
};
