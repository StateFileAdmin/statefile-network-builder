import { X } from "lucide-react";

interface Props {
  name: string;
  address: string;
  description: string;
  onChange: (
    change: Partial<Pick<Props, "name" | "address" | "description">>,
  ) => void;
  onClose: () => void;
}

export function LocationSettings({
  name,
  address,
  description,
  onChange,
  onClose,
}: Props) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dashboard-modal location-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Location settings"
      >
        <header>
          <div>
            <span className="eyebrow">Location settings · autosaves</span>
            <h2>Network details</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X />
          </button>
        </header>
        <div className="dashboard-modal-fields">
          <label>
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Location / address</span>
            <input
              value={address}
              onChange={(event) => onChange({ address: event.target.value })}
              placeholder="Office, building or physical address"
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={4}
              value={description}
              onChange={(event) =>
                onChange({ description: event.target.value })
              }
              placeholder="Purpose, scope or useful context for this network"
            />
          </label>
        </div>
      </section>
    </div>
  );
}
