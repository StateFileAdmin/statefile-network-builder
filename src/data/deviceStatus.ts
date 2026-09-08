import type { NetworkDevice, RecordStatus } from "../types";

const isPlanned = (device: NetworkDevice) =>
  device.status === "Planned" ||
  device.lifecycle === "Planned" ||
  device.state === "Future";
export const deviceIsRetired = (device: NetworkDevice) =>
  device.status === "Retired" || device.lifecycle === "Retired";

export const connectionStatusFor = (
  source: NetworkDevice | undefined,
  target: NetworkDevice | undefined,
  fallback: RecordStatus,
): RecordStatus => {
  if (!source || !target) return fallback;
  if (isPlanned(source) || isPlanned(target)) return "Planned";
  if (deviceIsRetired(source) && deviceIsRetired(target)) return "Retired";
  return source.status === target.status ? source.status : fallback;
};
