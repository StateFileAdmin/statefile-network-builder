import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  IpPlanEntry,
  NetworkConnection,
  NetworkDevice,
  RecordStatus,
} from "../types";
import { CustomSelect } from "./FormControls";
import { portSummaryForDevice, portSummaryLabel } from "../data/portMap";
const lifecycle = (device: NetworkDevice) =>
  device.lifecycle ??
  (device.status === "Retired"
    ? "Retired"
    : device.status === "Planned" || device.state === "Future"
      ? "Planned"
      : "Active");
const statusOptions = [
  "Known",
  "Needs Verification",
  "Planned",
  "Retired",
  "Compromised",
].map((value) => ({ value, label: value }));
export function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase().replace(" ", "-")}`}>
      {status}
    </span>
  );
}
export function AssetRegister({
  devices,
  connections,
  onEdit,
  onAdd,
}: {
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Inventory</span>
          <h2>Asset register</h2>
        </div>
        <button onClick={onAdd}>
          <Plus size={16} /> Add device
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Type</th>
              <th>Device / service details</th>
              <th>Management IP</th>
              <th>Subnet / VLAN</th>
              <th>Location</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">
                  No devices recorded for this site.
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr
                  key={d.id}
                  className={d.state === "Future" ? "future-row" : ""}
                >
                  <td>
                    <b>{d.hostname}</b>
                    <small>{lifecycle(d)}</small>
                  </td>
                  <td>{d.deviceType}</td>
                  <td>
                    {portSummaryForDevice(d, devices, connections)
                      ? portSummaryLabel(
                          portSummaryForDevice(d, devices, connections)!,
                        )
                      : d.deviceType === "Internet service"
                        ? [d.serviceProvider, d.serviceType]
                            .filter(Boolean)
                            .join(" · ") || "—"
                        : [
                              "Client group",
                              "Camera group",
                              "Ethernet outlet",
                              "VPN service",
                            ].includes(d.deviceType)
                          ? "Not applicable"
                          : [d.manufacturer, d.model]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                  </td>
                  <td>{d.managementIp || "—"}</td>
                  <td>{d.subnetVlan || "—"}</td>
                  <td>{d.physicalLocation || "—"}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => onEdit(d.id)}
                      aria-label={`Edit ${d.hostname}`}
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface IpProps {
  entries: IpPlanEntry[];
  onChange: (entries: IpPlanEntry[]) => void;
  canDelete?: boolean;
}
const blankIp = (): IpPlanEntry => ({
  id: `ip-${crypto.randomUUID()}`,
  name: "New network",
  cidr: "",
  vlanId: "",
  gateway: "",
  dhcpRange: "",
  dnsServers: "",
  purpose: "",
  status: "Needs Verification",
  state: "Current",
  notes: "",
});
export function IpPlan({ entries, onChange }: IpProps) {
  const update = (id: string, key: keyof IpPlanEntry, value: string) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
  return (
    <section className="content-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Addressing</span>
          <h2>IP address plan</h2>
        </div>
        <button onClick={() => onChange([...entries, blankIp()])}>
          <Plus size={16} /> Add network
        </button>
      </div>
      <div className="inline-security-note">
        <AlertTriangle size={14} />
        Private addressing may be documented here. Do not record public WAN
        addresses, exposed management URLs or credentials.
      </div>
      <div className="table-wrap editable-table">
        <table>
          <thead>
            <tr>
              <th>Name / purpose</th>
              <th>CIDR</th>
              <th>VLAN</th>
              <th>Gateway</th>
              <th>DHCP range</th>
              <th>DNS</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">
                  No networks recorded for this site.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.id}
                  className={e.state === "Future" ? "future-row" : ""}
                >
                  <td>
                    <input
                      value={e.name}
                      onChange={(x) => update(e.id, "name", x.target.value)}
                    />
                    <input
                      className="sub-input"
                      value={e.purpose}
                      placeholder="Purpose"
                      onChange={(x) => update(e.id, "purpose", x.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={e.cidr}
                      onChange={(x) => update(e.id, "cidr", x.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={e.vlanId}
                      onChange={(x) => update(e.id, "vlanId", x.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={e.gateway}
                      onChange={(x) => update(e.id, "gateway", x.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={e.dhcpRange}
                      onChange={(x) =>
                        update(e.id, "dhcpRange", x.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={e.dnsServers}
                      onChange={(x) =>
                        update(e.id, "dnsServers", x.target.value)
                      }
                    />
                  </td>
                  <td>
                    <CustomSelect
                      label={`IP network status`}
                      value={e.status}
                      options={statusOptions}
                      onChange={(value) => update(e.id, "status", value)}
                    />
                  </td>
                  <td>
                    <button
                      className="table-action danger-text"
                      onClick={() =>
                        onChange(entries.filter((x) => x.id !== e.id))
                      }
                      aria-label={`Remove ${e.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="autosave-note">Changes in this table save automatically.</p>
    </section>
  );
}
