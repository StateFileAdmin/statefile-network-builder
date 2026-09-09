import { isVpnConnection } from "./connectionTypes";
import type { NetworkConnection, NetworkDevice } from "../types";

const routesTraffic = (device: NetworkDevice) => {
  const type = device.deviceType.toLowerCase();
  return (
    device.operatingMode !== "Access point only" &&
    device.operatingMode !== "Modem / bridge only" &&
    (type.includes("router") ||
      type.includes("firewall") ||
      type.includes("security gateway"))
  );
};

export const hasRoutingUpstream = (
  deviceId: string,
  devices: NetworkDevice[],
  connections: NetworkConnection[],
) => {
  const device = devices.find((item) => item.id === deviceId);
  if (!device || !routesTraffic(device)) return false;
  return connections.some((connection) => {
    if (
      connection.target !== deviceId ||
      connection.status === "Removed" ||
      isVpnConnection(connection)
    )
      return false;
    const source = devices.find((item) => item.id === connection.source);
    return source ? routesTraffic(source) : false;
  });
};
