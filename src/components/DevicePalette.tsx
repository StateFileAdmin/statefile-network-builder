import { useMemo, useState } from "react";
import {
  Box,
  Cable,
  Cloud,
  EthernetPort,
  Laptop,
  MonitorSmartphone,
  Phone,
  Printer,
  Radio,
  Router,
  Search,
  Server,
  Shield,
  Users,
  Video,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { InfrastructureState, RecordStatus } from "../types";
export interface DeviceTemplate {
  name: string;
  deviceType: string;
  connectionType: string;
  notes: string;
  searchTerms?: string;
  state?: InfrastructureState;
  status?: RecordStatus;
  icon: LucideIcon;
  group: "Network edge" | "Distribution & Wi-Fi" | "Services" | "Endpoints";
}
const templates: DeviceTemplate[] = [
  {
    name: "Internet service",
    deviceType: "Internet service",
    connectionType: "WAN / NBN",
    notes:
      "Record the provider, service type and circuit details. Public WAN IPs are excluded from management reports.",
    icon: Cloud,
    group: "Network edge",
  },
  {
    name: "NBN connection box / NTD",
    deviceType: "NBN connection box / NTD",
    connectionType: "NBN / Ethernet",
    notes:
      "Record the NBN technology, connection-box model, serial number, active UNI-D port and physical location.",
    icon: Box,
    group: "Network edge",
  },
  {
    name: "Router / WAP",
    deviceType: "Router",
    searchTerms: "wireless router WAP AP access point",
    connectionType: "WAN / Ethernet",
    notes: "Record gateway, DHCP, DNS, firmware and routing configuration.",
    icon: Router,
    group: "Network edge",
  },
  {
    name: "Router / security gateway",
    deviceType: "Router / security gateway",
    connectionType: "WAN / Ethernet / VPN",
    notes:
      "For one appliance that provides routing, NAT, firewall and VPN functions, such as a TP-Link Omada ER605.",
    icon: Router,
    group: "Network edge",
  },
  {
    name: "Firewall / NGFW",
    deviceType: "Firewall / NGFW",
    connectionType: "WAN / Ethernet / VPN",
    notes:
      "For a dedicated firewall or next-generation firewall appliance. Record security services, policies, logging and VPN capability.",
    icon: Shield,
    group: "Network edge",
  },
  {
    name: "VPN connection",
    deviceType: "VPN service",
    connectionType: "WireGuard / IPsec",
    notes:
      "Record tunnel endpoints, purpose and routing. Do not store credentials or private keys.",
    icon: Radio,
    group: "Network edge",
  },
  {
    name: "Managed switch",
    deviceType: "Managed switch",
    connectionType: "Ethernet / VLAN / PoE",
    notes: "Record management IP, VLANs, trunks, PoE budget and port mapping.",
    icon: Cable,
    group: "Distribution & Wi-Fi",
  },
  {
    name: "Unmanaged switch",
    deviceType: "Unmanaged switch",
    connectionType: "Ethernet",
    notes: "Record model, physical location and connected port map.",
    icon: Zap,
    group: "Distribution & Wi-Fi",
  },
  {
    name: "Patch panel",
    deviceType: "Patch panel",
    connectionType: "Structured cabling",
    notes: "Record rack position, port labels and destination mapping.",
    icon: MonitorSmartphone,
    group: "Distribution & Wi-Fi",
  },
  {
    name: "Ethernet outlet / data point",
    deviceType: "Ethernet outlet",
    connectionType: "Structured cabling / Ethernet",
    notes:
      "Record the outlet label, room or desk location, patch-panel port and connected switch port.",
    icon: EthernetPort,
    group: "Distribution & Wi-Fi",
  },
  {
    name: "Wireless access point",
    deviceType: "Wireless access point",
    searchTerms: "WAP AP EAP Wi-Fi wireless AP",
    connectionType: "Ethernet / PoE / Wi-Fi",
    notes:
      "Record SSIDs, security mode, channel plan, controller and switch port.",
    icon: Wifi,
    group: "Distribution & Wi-Fi",
  },
  {
    name: "Server",
    deviceType: "Server",
    connectionType: "Ethernet",
    notes:
      "Record server role, operating system, IP allocation and dependencies.",
    icon: Server,
    group: "Services",
  },
  {
    name: "NAS / storage",
    deviceType: "Network storage",
    connectionType: "Ethernet",
    notes: "Record storage role, management interface and backup dependencies.",
    icon: Server,
    group: "Services",
  },
  {
    name: "Network video recorder (NVR)",
    deviceType: "Network video recorder",
    connectionType: "Ethernet / PoE",
    notes:
      "Record recorder model, storage capacity, camera network, switch connection and retention period.",
    icon: Video,
    group: "Services",
  },
  {
    name: "Network printer",
    deviceType: "Printer",
    connectionType: "Ethernet / Wi-Fi",
    notes: "Record static or reserved IP, location, model and print queue.",
    icon: Printer,
    group: "Endpoints",
  },
  {
    name: "End-user devices",
    deviceType: "Client group",
    connectionType: "Ethernet / Wi-Fi",
    notes:
      "Use as a single summary node for all user computers, phones and tablets when individual endpoint records are unnecessary.",
    icon: Users,
    group: "Endpoints",
  },
  {
    name: "VoIP phone",
    deviceType: "VoIP phone",
    connectionType: "Ethernet / PoE",
    notes: "Record extension, voice VLAN, switch port and handset model.",
    icon: Phone,
    group: "Endpoints",
  },
  {
    name: "Workstation / laptop",
    deviceType: "User endpoint",
    connectionType: "Ethernet / Wi-Fi",
    notes:
      "Record assigned user only when operationally necessary; do not store sensitive personal data.",
    icon: Laptop,
    group: "Endpoints",
  },
  {
    name: "Camera / security device",
    deviceType: "IP camera",
    connectionType: "Ethernet / PoE / Wi-Fi",
    notes:
      "Record camera purpose, infrastructure VLAN and recorder dependency.",
    icon: Video,
    group: "Endpoints",
  },
  {
    name: "All cameras",
    deviceType: "Camera group",
    connectionType: "Ethernet / PoE / Wi-Fi",
    notes:
      "Use as a summary node when individual camera records are unnecessary. Record the total camera count.",
    icon: Video,
    group: "Endpoints",
  },
  {
    name: "IoT / building device",
    deviceType: "IoT device",
    connectionType: "Ethernet / Wi-Fi",
    notes: "Record purpose, isolated network and responsible service owner.",
    icon: Radio,
    group: "Endpoints",
  },
];
export function DevicePalette({
  onAdd,
  onClose,
}: {
  onAdd: (template: DeviceTemplate) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      templates.filter((t) =>
        `${t.name} ${t.deviceType} ${t.group} ${t.searchTerms ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );
  const groups = [...new Set(results.map((t) => t.group))];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="device-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Add a device"
      >
        <button
          className="icon-button palette-close"
          onClick={onClose}
          aria-label="Close catalogue"
        >
          <X />
        </button>
        <label className="palette-search">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search router, switch, printer…"
          />
        </label>
        <div className="palette-scroll">
          {groups.map((group) => (
            <div className="palette-group" key={group}>
              <h3>{group}</h3>
              <div className="palette-grid">
                {results
                  .filter((t) => t.group === group)
                  .map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.name}
                        className="palette-card"
                        onClick={() => onAdd(t)}
                      >
                        <span className="palette-icon">
                          <Icon size={19} />
                        </span>
                        <span>
                          <b>{t.name}</b>
                          <small>{t.connectionType}</small>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="palette-empty">No matching component types.</div>
          )}
        </div>
      </section>
    </div>
  );
}
