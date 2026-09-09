import { portConnections } from "./physicalPorts";
import { usesPhysicalPort } from "./connectionTypes";
import type { NetworkConnection, NetworkDevice } from "../types";

export type PortSummary = {
  count: number;
  unassigned?: number;
  connected: number[];
  disabled: number[];
  available: number[];
};

const validPorts = (ports: number[] | undefined, count: number) =>
  [...new Set(ports ?? [])]
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= count)
    .sort((a, b) => a - b);

export const patchPortSummary = (device: NetworkDevice): PortSummary => {
  const count = Math.max(1, Math.min(96, device.portCount ?? 24));
  const disabled = validPorts(device.disabledPorts, count);
  const disabledSet = new Set(disabled);
  const connected = validPorts(device.connectedPorts, count).filter(
    (port) => !disabledSet.has(port),
  );
  const unavailable = new Set([...connected, ...disabled]);
  const available = Array.from(
    { length: count },
    (_, index) => index + 1,
  ).filter((port) => !unavailable.has(port));
  return { count, connected, disabled, available };
};

export const upstreamPatchPanel = (
  deviceId: string,
  devices: NetworkDevice[],
  connections: NetworkConnection[],
) => {
  const linkedIds = connections
    .filter((connection) =>
      [connection.source, connection.target].includes(deviceId),
    )
    .map((connection) =>
      connection.source === deviceId ? connection.target : connection.source,
    );
  return devices.find(
    (device) =>
      linkedIds.includes(device.id) && device.deviceType === "Patch panel",
  );
};

const isSwitch = (device: NetworkDevice) =>
  device.deviceType === "Managed switch" ||
  device.deviceType === "Unmanaged switch";

const switchPortSummary = (
  device: NetworkDevice,
  devices: NetworkDevice[],
  connections: NetworkConnection[],
): PortSummary => {
  const count = Math.max(
    1,
    Math.min(
      96,
      device.portCount ?? (device.deviceType === "Unmanaged switch" ? 8 : 24),
    ),
  );
  const used = Math.min(
    count,
    connections
      .filter(
        (connection) =>
          usesPhysicalPort(connection) &&
          [connection.source, connection.target].includes(device.id),
      )
      .reduce((total, connection) => {
        const otherId =
          connection.source === device.id
            ? connection.target
            : connection.source;
        const other = devices.find((candidate) => candidate.id === otherId);
        return (
          total +
          (other?.deviceType === "Patch panel"
            ? patchPortSummary(other).connected.length
            : 1)
        );
      }, 0),
  );
  const connected = Array.from({ length: used }, (_, index) => index + 1);
  const available = Array.from(
    { length: count - used },
    (_, index) => used + index + 1,
  );
  return { count, connected, disabled: [], available };
};

export const portSummaryForDevice = (
  device: NetworkDevice,
  devices: NetworkDevice[],
  connections: NetworkConnection[],
) => {
  if (device.physicalPorts?.length) {
    const ports = device.physicalPorts;
    return {
      count: ports.length,
      unassigned: connections.filter(
        (c) =>
          c.status !== "Removed" &&
          usesPhysicalPort(c) &&
          ((c.source === device.id && !c.sourcePortId) ||
            (c.target === device.id && !c.targetPortId)),
      ).length,
      connected: ports.flatMap((p, i) =>
        portConnections(device.id, p.id, connections).length ? [i + 1] : [],
      ),
      disabled: ports.flatMap((p, i) => (!p.enabled ? [i + 1] : [])),
      available: ports.flatMap((p, i) =>
        p.enabled && !portConnections(device.id, p.id, connections).length
          ? [i + 1]
          : [],
      ),
    };
  }
  if (isSwitch(device)) return switchPortSummary(device, devices, connections);
  const patch =
    device.deviceType === "Patch panel"
      ? device
      : device.deviceType === "Ethernet outlet"
        ? upstreamPatchPanel(device.id, devices, connections)
        : undefined;
  return patch ? patchPortSummary(patch) : undefined;
};

export const portSummaryLabel = (summary: PortSummary) =>
  summary.unassigned
    ? `${summary.connected.length} assigned · ${summary.unassigned} links need ports`
    : [
        `${summary.connected.length} active`,
        `${summary.available.length} available`,
        summary.disabled.length ? `${summary.disabled.length} disabled` : "",
      ]
        .filter(Boolean)
        .join(" · ");

export const connectionPortLabel = (
  connection: NetworkConnection,
  devices: NetworkDevice[],
  connections: NetworkConnection[] = [],
) => {
  if (connection.label.trim()) return connection.label;
  const source = devices.find((device) => device.id === connection.source);
  const target = devices.find((device) => device.id === connection.target);
  const namedPorts = [
    [source, connection.sourcePortId],
    [target, connection.targetPortId],
  ] as const;
  const labels = namedPorts.flatMap(([device, id]) => {
    const port = device?.physicalPorts?.find((p) => p.id === id);
    return port ? [`${device?.hostname}: ${port.label || port.role}`] : [];
  });
  if (usesPhysicalPort(connection) && labels.length) return labels.join(" → ");
  const directSwitch = [source, target].find(
    (device) => device && isSwitch(device),
  );
  if (
    directSwitch &&
    ![source, target].some((device) => device?.deviceType === "Patch panel")
  ) {
    if (!usesPhysicalPort(connection)) return "";
    return "1 port on each device";
  }
  const patch = [source, target].find(
    (device) => device?.deviceType === "Patch panel",
  );
  if (!patch) return "";
  const other = patch.id === source?.id ? target : source;
  const summary = patchPortSummary(patch);
  if (other && isSwitch(other)) {
    const switchSummary = switchPortSummary(other, devices, connections);
    return `${summary.connected.length}/${switchSummary.count} switch → ${summary.connected.length}/${summary.count} patch`;
  }
  if (other?.deviceType === "Ethernet outlet") return portSummaryLabel(summary);
  return "";
};
