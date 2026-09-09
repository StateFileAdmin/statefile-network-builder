import type {
  NetworkConnection,
  NetworkDevice,
  PhysicalPort,
  ConfigurationStatus,
} from "../types";
import { CustomSelect, DatePicker } from "./FormControls";
import { usesPhysicalPort } from "../data/connectionTypes";
import { portConnections } from "../data/physicalPorts";

export function DeviceConfiguration({
  device,
  connections,
  devices,
  onChange,
}: {
  device: NetworkDevice;
  connections: NetworkConnection[];
  devices: NetworkDevice[];
  onChange: (device: NetworkDevice) => void;
}) {
  const ports = device.physicalPorts ?? [];
  const unassigned = connections.filter(
    (c) =>
      c.status !== "Removed" &&
      usesPhysicalPort(c) &&
      ((c.source === device.id && !c.sourcePortId) ||
        (c.target === device.id && !c.targetPortId)),
  );
  const update = (id: string, patch: Partial<PhysicalPort>) =>
    onChange({
      ...device,
      physicalPorts: ports.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  const security =
    /router|gateway|firewall|access point/i.test(device.deviceType) ||
    device.firewall ||
    device.vpn;
  return (
    <>
      <section className="editor-section device-configuration-section">
        <h3>Physical ports</h3>
        <p className="form-help">
          Record the sockets on this device. Then select each end's port in the
          connection editor. Existing links stay unassigned until you identify
          their ports.
        </p>
        {unassigned.length > 0 && (
          <p className="form-help">
            {unassigned.length} existing connection(s) still need a port
            assigned on this device.
          </p>
        )}
        {ports.map((port) => {
          const links = portConnections(device.id, port.id, connections);
          return (
            <fieldset key={port.id} className="physical-port-record">
              <legend>{port.label || "Unnamed port"}</legend>
              <div className="form-grid">
                <label>
                  <span>Port label</span>
                  <input
                    maxLength={100}
                    value={port.label}
                    onChange={(e) => update(port.id, { label: e.target.value })}
                  />
                </label>
                <label>
                  <span>Port role</span>
                  <CustomSelect
                    label={`Role for ${port.label}`}
                    value={port.role}
                    options={["LAN", "WAN", "WAN/LAN", "Uplink", "DSL"].map(
                      (value) => ({ value, label: value }),
                    )}
                    onChange={(role) =>
                      update(port.id, { role: role as PhysicalPort["role"] })
                    }
                  />
                </label>
                <label className="span-2">
                  <span>Port notes</span>
                  <input
                    maxLength={2000}
                    value={port.notes}
                    onChange={(e) => update(port.id, { notes: e.target.value })}
                  />
                </label>
              </div>
              <p className="form-help">
                {links.length
                  ? links
                      .map(
                        (c) =>
                          `${c.state}: ${devices.find((d) => d.id === (c.source === device.id ? c.target : c.source))?.hostname ?? "Connected device"}`,
                      )
                      .join(" · ")
                  : "No assigned connection"}
              </p>
              <div className="physical-port-actions">
                <button
                  type="button"
                  disabled={links.length > 0}
                  aria-pressed={!port.enabled}
                  onClick={() => update(port.id, { enabled: !port.enabled })}
                >
                  {port.enabled ? "Disable port" : "Enable port"}
                </button>
                <button
                  type="button"
                  disabled={links.length > 0}
                  onClick={() =>
                    onChange({
                      ...device,
                      physicalPorts: ports.filter((p) => p.id !== port.id),
                    })
                  }
                >
                  Remove port
                </button>
              </div>
              {!!links.length && (
                <small>
                  Unassign the connection before disabling or removing this
                  port.
                </small>
              )}
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={ports.length >= 96}
          onClick={() =>
            onChange({
              ...device,
              physicalPorts: [
                ...ports,
                {
                  id: crypto.randomUUID(),
                  label: `Port ${ports.length + 1}`,
                  role: "LAN",
                  enabled: true,
                  notes: "",
                },
              ],
            })
          }
        >
          Add physical port
        </button>
      </section>
      {security &&
        (["firewall", "vpn"] as const).map((key) => {
          const value = device[key] ?? {
            status: "Not documented" as const,
            details: "",
            lastVerified: "",
          };
          const title = key === "firewall" ? "Firewall" : "VPN";
          return (
            <section
              className="editor-section device-configuration-section"
              key={key}
            >
              <h3>{title} configuration</h3>
              <div className="form-grid">
                <label>
                  <span>{title} status</span>
                  <CustomSelect
                    label={`${title} status`}
                    value={value.status}
                    options={["Not documented", "Enabled", "Disabled"].map(
                      (v) => ({ value: v, label: v }),
                    )}
                    onChange={(status) =>
                      onChange({
                        ...device,
                        [key]: {
                          ...value,
                          status: status as ConfigurationStatus,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>{title} last verified</span>
                  <DatePicker
                    label={`${title} last verified`}
                    value={value.lastVerified}
                    onChange={(lastVerified) =>
                      onChange({ ...device, [key]: { ...value, lastVerified } })
                    }
                  />
                </label>
                <label className="span-2">
                  <span>
                    {title === "Firewall"
                      ? "Rules, purpose and configuration notes"
                      : "Protocols, tunnel purpose and configuration notes"}
                  </span>
                  <textarea
                    rows={4}
                    maxLength={10000}
                    value={value.details}
                    onChange={(e) =>
                      onChange({
                        ...device,
                        [key]: { ...value, details: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <p className="form-help">
                {key === "firewall"
                  ? "Record the settings you verified. The model alone does not confirm that a firewall is enabled."
                  : "Document tunnels as connections between gateways, or as relationships between locations. Do not record passwords, keys or shared secrets."}
              </p>
            </section>
          );
        })}
    </>
  );
}
