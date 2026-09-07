import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import type { NetworkConnection, NetworkDevice, RecordStatus } from "../types";
import { CustomSelect, DatePicker } from "./FormControls";
const statuses: RecordStatus[] = [
  "Known",
  "Needs Verification",
  "Planned",
  "Retired",
];
const statusOptions = statuses.map((value) => ({ value, label: value }));
const stateOptions = [
  {
    value: "Current",
    label: "Current",
    description: "Existing infrastructure",
  },
  {
    value: "Future",
    label: "Future",
    description: "Proposed or planned design",
  },
];
const fields: [keyof NetworkDevice, string, string?][] = [
  ["hostname", "Hostname"],
  ["deviceType", "Device type"],
  ["manufacturer", "Manufacturer"],
  ["model", "Model"],
  ["managementIp", "Management IP"],
  ["subnetVlan", "Subnet / VLAN"],
  ["macAddress", "MAC address"],
  ["serialNumber", "Serial number"],
  ["connectionType", "Connection type"],
  ["physicalLocation", "Physical location"],
  ["switchPort", "Switch port"],
  ["lastVerified", "Last verified", "date"],
];
interface DeviceProps {
  kind: "device";
  value: NetworkDevice;
  onSave: (v: NetworkDevice) => void;
  onDelete?: () => void;
  onClose: () => void;
}
interface ConnectionProps {
  kind: "connection";
  value: NetworkConnection;
  deviceNames: Record<string, string>;
  onSave: (v: NetworkConnection) => void;
  onDelete?: () => void;
  onClose: () => void;
}
export function Drawer(props: DeviceProps | ConnectionProps) {
  return (
    <aside className="drawer" aria-label={`${props.kind} editor`}>
      <div className="drawer-header">
        <div>
          <span className="eyebrow">{props.kind} editor</span>
          <h2>
            {props.value.id.startsWith("new-") ? "New " : ""}
            {props.kind}
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={props.onClose}
          aria-label="Close editor"
        >
          <X />
        </button>
      </div>
      {props.kind === "device" ? (
        <DeviceForm {...props} />
      ) : (
        <ConnectionForm {...props} />
      )}
    </aside>
  );
}
function DeviceForm({ value, onSave, onDelete }: DeviceProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };
  return (
    <form onSubmit={submit} className="editor-form">
      <SensitiveDataNotice />
      <div className="form-grid">
        {fields.map(([key, label, type]) => (
          <label
            key={key}
            className={
              key === "hostname" || key === "deviceType" ? "span-2" : ""
            }
          >
            <span>{label}</span>
            {type === "date" ? (
              <DatePicker
                label={label}
                value={String(draft[key])}
                onChange={(v) => setDraft({ ...draft, [key]: v })}
              />
            ) : (
              <input
                value={String(draft[key])}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <label>
          <span>Status</span>
          <CustomSelect
            label="Device status"
            value={draft.status}
            options={statusOptions}
            onChange={(v) => setDraft({ ...draft, status: v as RecordStatus })}
          />
        </label>
        <label>
          <span>Infrastructure state</span>
          <CustomSelect
            label="Infrastructure state"
            value={draft.state}
            options={stateOptions}
            onChange={(v) =>
              setDraft({ ...draft, state: v as "Current" | "Future" })
            }
          />
        </label>
        <label className="span-2">
          <span>Notes</span>
          <textarea
            rows={5}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary">
          Save device
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          <Trash2 size={16} /> Remove
        </button>
      </div>
    </form>
  );
}
function ConnectionForm({
  value,
  deviceNames,
  onSave,
  onDelete,
}: ConnectionProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const deviceOptions = Object.entries(deviceNames).map(([value, label]) => ({
    value,
    label,
  }));
  return (
    <form
      className="editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <SensitiveDataNotice />
      <div className="form-grid">
        <label className="span-2">
          <span>Label</span>
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>
        <label>
          <span>From</span>
          <CustomSelect
            label="Connection source"
            value={draft.source}
            options={deviceOptions}
            onChange={(v) => setDraft({ ...draft, source: v })}
          />
        </label>
        <label>
          <span>To</span>
          <CustomSelect
            label="Connection target"
            value={draft.target}
            options={deviceOptions}
            onChange={(v) => setDraft({ ...draft, target: v })}
          />
        </label>
        <label className="span-2">
          <span>Connection type</span>
          <input
            value={draft.connectionType}
            onChange={(e) =>
              setDraft({ ...draft, connectionType: e.target.value })
            }
          />
        </label>
        <label>
          <span>Status</span>
          <CustomSelect
            label="Connection status"
            value={draft.status}
            options={statusOptions}
            onChange={(v) => setDraft({ ...draft, status: v as RecordStatus })}
          />
        </label>
        <label>
          <span>Infrastructure state</span>
          <CustomSelect
            label="Infrastructure state"
            value={draft.state}
            options={stateOptions}
            onChange={(v) =>
              setDraft({ ...draft, state: v as "Current" | "Future" })
            }
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary">Save connection</button>
        <button type="button" className="danger" onClick={onDelete}>
          <Trash2 size={16} /> Remove
        </button>
      </div>
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
