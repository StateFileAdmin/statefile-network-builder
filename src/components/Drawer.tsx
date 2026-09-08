import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Trash2, X } from "lucide-react";
import type { NetworkConnection, NetworkDevice, RecordStatus } from "../types";
import { CustomSelect, DatePicker } from "./FormControls";

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

interface DeviceProps {
  kind: "device";
  value: NetworkDevice;
  onSave: (value: NetworkDevice) => void;
  onDelete?: () => void;
  onClose: () => void;
}
interface ConnectionProps {
  kind: "connection";
  value: NetworkConnection;
  deviceNames: Record<string, string>;
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

function DeviceForm({ value, onSave }: DeviceProps) {
  const [draft, setDraft] = useState(value),
    [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const change = (next: NetworkDevice) => {
    setDraft(next);
    onSave(next);
  };
  const input = (key: keyof NetworkDevice, label: string, wide = false) => (
    <label className={wide ? "span-2" : ""}>
      <span>{label}</span>
      <input
        value={String(draft[key])}
        onChange={(event) => change({ ...draft, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <form className="editor-form" onSubmit={(event) => event.preventDefault()}>
      <SensitiveDataNotice />
      <section className="editor-section">
        <h3>Device</h3>
        <div className="form-grid">
          {input("hostname", "Name", true)}
          <div className="device-type-summary span-2">
            <span>Device type</span>
            <strong>{draft.deviceType}</strong>
          </div>
          {draft.deviceType.toLowerCase().includes("wireless access point") && (
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
            <span>Status</span>
            <CustomSelect
              label="Device status"
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
          {input("manufacturer", "Manufacturer")}
          {input("model", "Model")}
          {input("physicalLocation", "Physical location", true)}
          {input("connectionType", "Connection type", true)}
        </div>
      </section>
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
            {input("managementIp", "Management IP")}
            {input("subnetVlan", "Subnet / VLAN")}
            {input("switchPort", "Switch / panel port")}
            {input("macAddress", "MAC address")}
            {input("serialNumber", "Serial number")}
            <label>
              <span>Last verified</span>
              <DatePicker
                label="Last verified"
                value={draft.lastVerified}
                onChange={(lastVerified) => change({ ...draft, lastVerified })}
              />
            </label>
          </div>
        </section>
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

function ConnectionForm({ value, deviceNames, onSave }: ConnectionProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const deviceOptions = Object.entries(deviceNames).map(([value, label]) => ({
    value,
    label,
  }));
  const change = (next: NetworkConnection) => {
    setDraft(next);
    onSave(next);
  };
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
              onChange={(event) =>
                change({ ...draft, connectionType: event.target.value })
              }
            />
          </label>
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
