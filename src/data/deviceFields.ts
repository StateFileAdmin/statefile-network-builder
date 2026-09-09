export interface DeviceFieldProfile {
  service: boolean;
  manufacturerModel: boolean;
  physicalLocation: boolean;
  connectionType: boolean;
  managementIp: boolean;
  subnetVlan: boolean;
  switchPort: boolean;
  macAddress: boolean;
  serialNumber: boolean;
}

const managedHardware: DeviceFieldProfile = {
  service: false,
  manufacturerModel: true,
  physicalLocation: true,
  connectionType: true,
  managementIp: true,
  subnetVlan: true,
  switchPort: true,
  macAddress: true,
  serialNumber: true,
};

const profiles: Record<string, DeviceFieldProfile> = {
  "Internet service": {
    service: true,
    manufacturerModel: false,
    physicalLocation: false,
    connectionType: true,
    managementIp: false,
    subnetVlan: false,
    switchPort: false,
    macAddress: false,
    serialNumber: false,
  },
  "NBN connection box / NTD": {
    service: false,
    manufacturerModel: true,
    physicalLocation: true,
    connectionType: true,
    managementIp: false,
    subnetVlan: false,
    switchPort: true,
    macAddress: false,
    serialNumber: true,
  },
  Router: managedHardware,
  "Router / Gateway": managedHardware,
  Firewall: managedHardware,
  "Router / security gateway": managedHardware,
  "Firewall / NGFW": managedHardware,
  "VPN service": {
    service: false,
    manufacturerModel: false,
    physicalLocation: false,
    connectionType: true,
    managementIp: false,
    subnetVlan: true,
    switchPort: false,
    macAddress: false,
    serialNumber: false,
  },
  "Managed switch": managedHardware,
  "Unmanaged switch": {
    ...managedHardware,
    managementIp: false,
    subnetVlan: false,
  },
  "Patch panel": {
    service: false,
    manufacturerModel: true,
    physicalLocation: true,
    connectionType: true,
    managementIp: false,
    subnetVlan: false,
    switchPort: true,
    macAddress: false,
    serialNumber: false,
  },
  "Ethernet outlet": {
    service: false,
    manufacturerModel: false,
    physicalLocation: true,
    connectionType: true,
    managementIp: false,
    subnetVlan: false,
    switchPort: true,
    macAddress: false,
    serialNumber: false,
  },
  "Wireless access point": managedHardware,
  Server: managedHardware,
  "Network storage": managedHardware,
  "Network video recorder": managedHardware,
  Printer: managedHardware,
  "POS terminal": managedHardware,
  "Client group": {
    service: false,
    manufacturerModel: false,
    physicalLocation: false,
    connectionType: true,
    managementIp: false,
    subnetVlan: true,
    switchPort: false,
    macAddress: false,
    serialNumber: false,
  },
  "VoIP phone": managedHardware,
  "User endpoint": managedHardware,
  "IP camera": managedHardware,
  "Camera group": {
    service: false,
    manufacturerModel: false,
    physicalLocation: true,
    connectionType: true,
    managementIp: false,
    subnetVlan: true,
    switchPort: false,
    macAddress: false,
    serialNumber: false,
  },
  "IoT device": managedHardware,
};

export const deviceFieldProfile = (deviceType: string) =>
  profiles[deviceType] ?? managedHardware;
