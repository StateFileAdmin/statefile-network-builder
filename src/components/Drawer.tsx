import { placementIssue, reconcileWanPorts } from "../data/infrastructure";
import { InfrastructureEditor } from "./InfrastructureEditor";
import type { Cabinet } from "../types";
import { DeviceConfiguration } from "./DeviceConfiguration";
import { ConnectionPorts } from "./ConnectionPorts";
import { usesPhysicalPort } from "../data/connectionTypes";
import { isVpnConnection } from "../data/connectionTypes";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Trash2, X } from "lucide-react";
import type {
  DeviceLifecycle,
  DeviceOperatingMode,
  NetworkConnection,
  NetworkDevice,
  RecordStatus,
} from "../types";
import { CustomSelect, DatePicker, NumberStepper } from "./FormControls";
import { deviceFieldProfile } from "../data/deviceFields";
import { patchPortSummary, type PortSummary } from "../data/portMap";

const statuses: RecordStatus[] = [
  "Known",
  "Needs Verification",
  "Planned",
  "Retired",
  "Compromised",
];
const statusOptions = statuses.map((value) => ({ value, label: value }));
const stateOptions = [
  { value: "Current", label: "Current" },
  { value: "Future", label: "Future" },
];
const lifecycleOptions: DeviceLifecycle[] = [
  "Active",
  "Standby",
  "Legacy",
  "Disconnected",
  "Planned",
  "Retired",
];
const operatingModeOptions: DeviceOperatingMode[] = [
  "Router only",
  "Router + wireless access point",
  "Access point only",
  "Modem / bridge only",
];
const deviceLifecycle = (device: NetworkDevice): DeviceLifecycle =>
  device.lifecycle ??
  (device.status === "Retired"
    ? "Retired"
    : device.status === "Planned" || device.state === "Future"
      ? "Planned"
      : "Active");

interface DeviceProps {
  cabinets: Cabinet[];
  kind: "device";
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  value: NetworkDevice;
  onSave: (value: NetworkDevice) => void;
  routingWarning?: boolean;
  portSummary?: string;
  portDetails?: PortSummary;
  onDelete?: () => void;
  onClose: () => void;
}
interface ConnectionProps {
  kind: "connection";
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  value: NetworkConnection;
  deviceNames: Record<string, string>;
  portDeviceIds: string[];
  onSave: (value: NetworkConnection) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function Drawer(props: DeviceProps | ConnectionProps) {
  return (
    <aside className="drawer" aria-label={`${props.kind} editor`}>
      <div className="drawer-header">
        <div>
          <span className="eyebrow">{props.kind} · autosaves</span>
          <h2>
            {props.value.id.startsWith("new-") ? "New " : ""}
            {props.kind}
          </h2>
        </div>
        <div className="drawer-header-actions">
          {props.onDelete && (
            <button
              className="icon-button drawer-delete"
              onClick={props.onDelete}
              aria-label={`Remove ${props.kind}`}
              title={`Remove ${props.kind}`}
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            className="icon-button"
            onClick={props.onClose}
            aria-label="Close editor"
          >
            <X />
          </button>
        </div>
      </div>
      {props.kind === "device" ? (
        <DeviceForm {...props} />
      ) : (
        <ConnectionForm {...props} />
      )}
    </aside>
  );
}

function DeviceForm({
  cabinets,
  devices,
  connections,
  value,
  onSave,
  routingWarning,
  portSummary,
  portDetails,
}: DeviceProps) {
  const [configurationError, setConfigurationError] = useState("");
  const [draft, setDraft] = useState(value),
    [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const profile = deviceFieldProfile(draft.deviceType);
  const portLabel =
    draft.deviceType === "NBN connection box / NTD"
      ? "Active UNI-D / connected port"
      : draft.deviceType === "Patch panel" ||
          draft.deviceType === "Ethernet outlet"
        ? "Port / destination mapping"
        : "Switch / panel port";
  const change = (next: NetworkDevice) => {
    next = reconcileWanPorts(next);
    const issue = placementIssue(next, { devices, cabinets });
    if (issue) {
      setConfigurationError(issue);
      return;
    }
    setConfigurationError("");
    setDraft(next);
    onSave(next);
  };
  const cyclePort = (port: number) => {
    const summary = patchPortSummary(draft);
    const connected = new Set(summary.connected);
    const disabled = new Set(summary.disabled);
    if (connected.delete(port)) disabled.add(port);
    else if (disabled.has(port)) disabled.delete(port);
    else connected.add(port);
    change({
      ...draft,
      connectedPorts: [...connected].sort((a, b) => a - b),
      disabledPorts: [...disabled].sort((a, b) => a - b),
    });
  };
  const input = (key: keyof NetworkDevice, label: string, wide = false) => (
    <label className={wide ? "span-2" : ""}>
      <span>{label}</span>
      <input
        value={String(draft[key] ?? "")}
        onChange={(event) => change({ ...draft, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <form className="editor-form" onSubmit={(event) => event.preventDefault()}>
      <SensitiveDataNotice />
      {configurationError && (
        <p className="form-error" role="alert">
          {configurationError}
        </p>
      )}
      {(value.deviceType === "Ethernet outlet" ||
        value.deviceType === "Managed switch" ||
        value.deviceType === "Unmanaged switch") &&
        portSummary && (
          <div className="port-inherited-summary">
            <strong>
              {value.deviceType === "Ethernet outlet"
                ? "Inherited from patch panel"
                : "Use across connected patch panels"}
            </strong>
            <span>{portSummary}</span>
          </div>
        )}
      {routingWarning && draft.operatingMode !== "Access point only" && (
        <div className="routing-setup-warning">
          <AlertTriangle size={16} />
          <span>
            <strong>Set this to WAP only?</strong>
            Another router, firewall or security gateway is connected before it.
            Routing here may create double NAT.
          </span>
          <button
            type="button"
            onClick={() =>
              change({ ...draft, operatingMode: "Access point only" })
            }
          >
            Set to WAP only
          </button>
        </div>
      )}
      <section className="editor-section">
        <h3>Device</h3>
        <div className="form-grid">
          {input("hostname", "Name", true)}
          <div className="device-type-summary span-2">
            <span>Device type</span>
            <strong>{draft.deviceType}</strong>
          </div>
          {["Router", "Router / Gateway", "Modem"].includes(
            draft.deviceType,
          ) && (
            <label className="span-2">
              <span>Operating mode</span>
              <CustomSelect
                label="Router operating mode"
                value={draft.operatingMode ?? "Router only"}
                options={operatingModeOptions.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(operatingMode) =>
                  change({
                    ...draft,
                    operatingMode: operatingMode as DeviceOperatingMode,
                  })
                }
              />
            </label>
          )}
          {draft.deviceType === "Camera group" && (
            <label className="span-2">
              <span>Number of cameras</span>
              <NumberStepper
                value={draft.quantity ?? 1}
                min={1}
                max={10000}
                label="Number of cameras"
                onChange={(quantity) => change({ ...draft, quantity })}
              />
            </label>
          )}
          {(draft.deviceType.toLowerCase().includes("wireless access point") ||
            draft.operatingMode === "Router + wireless access point" ||
            draft.operatingMode === "Access point only") && (
            <label className="span-2">
              <span>Network names (SSIDs)</span>
              <textarea
                rows={2}
                value={draft.wirelessNetworks ?? ""}
                onChange={(event) =>
                  change({ ...draft, wirelessNetworks: event.target.value })
                }
                placeholder="One network per line, for example: Office Wi-Fi — 5 GHz"
              />
            </label>
          )}
          <label>
            <span>Verification / condition</span>
            <CustomSelect
              label="Device verification or condition"
              value={draft.status}
              options={statusOptions}
              onChange={(status) =>
                change({ ...draft, status: status as RecordStatus })
              }
            />
          </label>
          <label>
            <span>Lifecycle</span>
            <CustomSelect
              label="Device lifecycle"
              value={deviceLifecycle(draft)}
              options={lifecycleOptions.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => {
                const lifecycle = value as DeviceLifecycle;
                change({
                  ...draft,
                  lifecycle,
                  state: lifecycle === "Planned" ? "Future" : "Current",
                });
              }}
            />
          </label>
          {profile.service && input("serviceProvider", "Provider")}
          {profile.service && input("serviceType", "Service type")}
          {profile.service &&
            input("serviceReference", "Account / circuit reference", true)}
          {profile.manufacturerModel && input("manufacturer", "Manufacturer")}
          {profile.manufacturerModel && input("model", "Model")}
          {profile.physicalLocation &&
            input("physicalLocation", "Physical location", true)}
          {profile.connectionType &&
            input("connectionType", "Connection type", true)}
        </div>
      </section>
      <InfrastructureEditor
        device={draft}
        devices={devices}
        cabinets={cabinets}
        onSave={change}
      />
      <button
        type="button"
        className={`editor-details-toggle ${detailsOpen ? "open" : ""}`}
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
      >
        More details <ChevronDown size={16} />
      </button>
      {detailsOpen && (
        <section className="editor-section editor-secondary">
          <div className="form-grid">
            {profile.service && input("serviceCost", "Cost")}
            {["Patch panel", "Managed switch", "Unmanaged switch"].includes(
              draft.deviceType,
            ) && (
              <label>
                <span>Port count</span>
                <NumberStepper
                  value={
                    draft.portCount ??
                    (draft.deviceType === "Unmanaged switch" ? 8 : 24)
                  }
                  min={1}
                  max={96}
                  label="Port count"
                  onChange={(portCount) => change({ ...draft, portCount })}
                />
              </label>
            )}
            {profile.managementIp && input("managementIp", "Management IP")}
            {profile.subnetVlan && input("subnetVlan", "Subnet / VLAN")}
            {profile.switchPort && input("switchPort", portLabel)}
            {profile.macAddress && input("macAddress", "MAC address")}
            {profile.serialNumber && input("serialNumber", "Serial number")}
            <label>
              <span>Last verified</span>
              <DatePicker
                label="Last verified"
                value={draft.lastVerified}
                onChange={(lastVerified) => change({ ...draft, lastVerified })}
              />
            </label>
            {draft.deviceType === "Patch panel" && (
              <div className="port-map span-2">
                <div className="port-map-heading">
                  <span>Port map</span>
                  <small>Click: available → connected → disabled</small>
                </div>
                <div className="port-grid">
                  {Array.from(
                    { length: patchPortSummary(draft).count },
                    (_, index) => index + 1,
                  ).map((port) => {
                    const summary = patchPortSummary(draft);
                    const state = summary.connected.includes(port)
                      ? "connected"
                      : summary.disabled.includes(port)
                        ? "disabled"
                        : "available";
                    return (
                      <button
                        type="button"
                        key={port}
                        className={`port-button ${state}`}
                        title={`Port ${port}: ${state}`}
                        aria-label={`Port ${port}: ${state}`}
                        onClick={() => cyclePort(port)}
                      >
                        {port}
                      </button>
                    );
                  })}
                </div>
                <div className="port-map-legend">
                  <span>
                    <i className="connected" /> Connected
                  </span>
                  <span>
                    <i className="available" /> Available
                  </span>
                  <span>
                    <i className="disabled" /> Disabled
                  </span>
                </div>
              </div>
            )}
            {draft.deviceType === "Ethernet outlet" && portDetails && (
              <div className="port-map port-map-readonly span-2">
                <div className="port-map-heading">
                  <span>Inherited outlet map</span>
                  <small>Controlled by the connected patch panel</small>
                </div>
                <div className="port-grid">
                  {Array.from(
                    { length: portDetails.count },
                    (_, index) => index + 1,
                  ).map((port) => {
                    const state = portDetails.connected.includes(port)
                      ? "connected"
                      : portDetails.disabled.includes(port)
                        ? "disabled"
                        : "available";
                    return (
                      <span
                        key={port}
                        className={`port-button ${state}`}
                        title={`Outlet ${port}: ${state}`}
                      >
                        {port}
                      </span>
                    );
                  })}
                </div>
                <div className="port-map-legend">
                  <span>
                    <i className="connected" /> Active outlet
                  </span>
                  <span>
                    <i className="available" /> Available outlet
                  </span>
                  <span>
                    <i className="disabled" /> Disabled outlet
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {profile.manufacturerModel && draft.deviceType !== "Patch panel" && (
        <DeviceConfiguration
          device={draft}
          devices={devices}
          connections={connections}
          onChange={change}
        />
      )}
      <section className="editor-section editor-notes">
        <label>
          <span>Notes</span>
          <textarea
            rows={4}
            value={draft.notes}
            onChange={(event) =>
              change({ ...draft, notes: event.target.value })
            }
          />
        </label>
      </section>
    </form>
  );
}

function ConnectionForm({
  devices,
  connections,
  value,
  deviceNames,
  portDeviceIds,
  onSave,
}: ConnectionProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const deviceOptions = Object.entries(deviceNames).map(([value, label]) => ({
    value,
    label,
  }));
  const change = (next: NetworkConnection) => {
    const updated = {
      ...next,
      sourcePortId:
        next.source !== draft.source ||
        !usesPhysicalPort(next) ||
        next.state !== draft.state
          ? undefined
          : next.sourcePortId,
      targetPortId:
        next.target !== draft.target ||
        !usesPhysicalPort(next) ||
        next.state !== draft.state
          ? undefined
          : next.targetPortId,
    };
    setDraft(updated);
    onSave(updated);
  };
  const canUsePhysicalPort =
    !isVpnConnection(draft) &&
    (portDeviceIds.includes(draft.source) ||
      portDeviceIds.includes(draft.target));
  return (
    <form className="editor-form" onSubmit={(event) => event.preventDefault()}>
      <SensitiveDataNotice />
      <section className="editor-section">
        <h3>Connection</h3>
        <div className="form-grid">
          <label className="span-2">
            <span>Label</span>
            <input
              value={draft.label}
              onChange={(event) =>
                change({ ...draft, label: event.target.value })
              }
            />
          </label>
          <label>
            <span>From</span>
            <CustomSelect
              label="Connection source"
              value={draft.source}
              options={deviceOptions}
              onChange={(source) => change({ ...draft, source })}
            />
          </label>
          <label>
            <span>To</span>
            <CustomSelect
              label="Connection target"
              value={draft.target}
              options={deviceOptions}
              onChange={(target) => change({ ...draft, target })}
            />
          </label>
          <label className="span-2">
            <span>Connection type</span>
            <input
              value={draft.connectionType}
              aria-label="Connection type"
              onChange={(event) =>
                change({ ...draft, connectionType: event.target.value })
              }
            />
            <small>
              For a VPN, connect the two gateways and choose a VPN type. Use the
              location dashboard for a VPN between sites.
            </small>
          </label>
          <ConnectionPorts
            connection={draft}
            devices={devices}
            connections={connections}
            onChange={change}
          />
          {canUsePhysicalPort && (
            <label className="span-2">
              <span>Port usage</span>
              <button
                type="button"
                className={`port-usage-toggle ${draft.countsTowardPorts !== false ? "active" : ""}`}
                aria-pressed={draft.countsTowardPorts !== false}
                onClick={() =>
                  change({
                    ...draft,
                    countsTowardPorts: draft.countsTowardPorts === false,
                  })
                }
              >
                <span>
                  {draft.countsTowardPorts !== false
                    ? "Uses a physical port"
                    : "Does not use a physical port"}
                </span>
                <i />
              </button>
            </label>
          )}
          <label>
            <span>Status</span>
            <CustomSelect
              label="Connection status"
              value={draft.status}
              options={statusOptions}
              onChange={(status) =>
                change({ ...draft, status: status as RecordStatus })
              }
            />
          </label>
          <label>
            <span>State</span>
            <CustomSelect
              label="Infrastructure state"
              value={draft.state}
              options={stateOptions}
              onChange={(state) =>
                change({ ...draft, state: state as "Current" | "Future" })
              }
            />
          </label>
        </div>
      </section>
    </form>
  );
}

function SensitiveDataNotice() {
  return (
    <div className="sensitive-data-notice">
      <AlertTriangle size={15} />
      <span>
        Record private infrastructure details only when required. Never store
        public WAN addresses, exposed management URLs, passwords, VPN keys,
        PSKs, SNMP strings or portal credentials.
      </span>
    </div>
  );
}
