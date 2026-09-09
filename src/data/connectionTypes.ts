import type { NetworkConnection } from "../types";

export const isVpnConnection = (connection: NetworkConnection) =>
  /\b(vpn|ipsec|wireguard|openvpn)\b/i.test(connection.connectionType);

export const usesPhysicalPort = (connection: NetworkConnection) =>
  !isVpnConnection(connection) &&
  !/^(wi-?fi|wireless)$/i.test(connection.connectionType.trim()) &&
  connection.countsTowardPorts !== false;
