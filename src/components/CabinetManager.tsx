import { useModalFocus } from "./useModalFocus";
import { NumberStepper } from "./FormControls";
import { useState, useRef } from "react";
import type { Cabinet, Site } from "../types";
import {
  physicalLocationLabel,
  removeCabinet,
  validCabinets,
  validPlacement,
} from "../data/infrastructure";
export function CabinetManager({
  site,
  onChange,
  onClose,
  onDevice,
  canDelete,
}: {
  site: Site;
  onChange: (s: Site) => void;
  onClose: () => void;
  onDevice: (id: string) => void;
  canDelete: boolean;
}) {
  const modalRef = useRef<HTMLElement>(null);
  useModalFocus(modalRef, onClose);
  const [draft, setDraft] = useState<Cabinet[]>(site.cabinets ?? []),
    [error, setError] = useState(""),
    [removeId, setRemoveId] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(site.cabinets ?? []);
  const patch = (id: string, p: Partial<Cabinet>) =>
    setDraft(draft.map((c) => (c.id === id ? { ...c, ...p } : c)));
  return (
    <div className="modal-backdrop">
      <section
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cabinets and physical locations"
        className="dashboard-modal cabinet-manager"
      >
        <header>
          <div>
            <span className="eyebrow">{site.name} · Physical view</span>
            <h2>Cabinets and locations</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close cabinets"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="cabinet-manager-body">
          <p className="form-help">
            Create cabinets here, then assign devices in their advanced
            configuration. Rack units count upwards from the bottom. Current and
            future equipment can share planned rack space.
          </p>
          {draft.map((c) => (
            <section className="editor-section" key={c.id}>
              <div className="form-grid">
                <label>
                  <span>Cabinet name</span>
                  <input
                    maxLength={500}
                    value={c.name}
                    onChange={(e) => patch(c.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  <span>Room / location</span>
                  <input
                    maxLength={500}
                    value={c.room}
                    onChange={(e) => patch(c.id, { room: e.target.value })}
                  />
                </label>
                <label>
                  <span>Capacity (U)</span>
                  <NumberStepper
                    label="Capacity (U)"
                    min={1}
                    max={100}
                    value={c.capacity}
                    onChange={(capacity) => patch(c.id, { capacity })}
                  />
                </label>
                <label>
                  <span>Cabinet notes</span>
                  <input
                    maxLength={4000}
                    value={c.notes}
                    onChange={(e) => patch(c.id, { notes: e.target.value })}
                  />
                </label>
              </div>
              <div className="cabinet-equipment">
                {site.devices
                  .filter((d) => d.cabinetId === c.id)
                  .sort((a, b) => (b.rackUnit ?? 0) - (a.rackUnit ?? 0))
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        if (dirty) {
                          setError(
                            "Save cabinet changes before opening a device.",
                          );
                          return;
                        }
                        onDevice(d.id);
                        onClose();
                      }}
                    >
                      {d.hostname}
                      <small>
                        {physicalLocationLabel(d, [c])} · {d.state}
                      </small>
                    </button>
                  ))}
                {!site.devices.some((d) => d.cabinetId === c.id) && (
                  <p className="form-help">No devices assigned yet.</p>
                )}
              </div>
              {canDelete && (
                <button className="quiet" onClick={() => setRemoveId(c.id)}>
                  Remove cabinet…
                </button>
              )}
              {removeId === c.id && (
                <div role="alert">
                  <p>
                    Remove this cabinet? Its devices and cables will be kept;
                    cabinet and rack-unit assignments will be cleared when you
                    save.
                  </p>
                  <button
                    onClick={() => {
                      setDraft(draft.filter((x) => x.id !== c.id));
                      setRemoveId("");
                    }}
                  >
                    Confirm removal
                  </button>
                  <button onClick={() => setRemoveId("")}>Cancel</button>
                </div>
              )}
            </section>
          ))}
          <button
            onClick={() =>
              setDraft([
                ...draft,
                {
                  id: crypto.randomUUID(),
                  name: `Cabinet ${draft.length + 1}`,
                  room: "",
                  capacity: 12,
                  notes: "",
                },
              ])
            }
          >
            Add cabinet
          </button>
          <h3>Outside cabinets</h3>
          <div className="cabinet-equipment">
            {site.devices
              .filter((d) => !d.cabinetId)
              .map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    if (dirty) {
                      setError("Save cabinet changes before opening a device.");
                      return;
                    }
                    onDevice(d.id);
                    onClose();
                  }}
                >
                  {d.hostname}
                  <small>
                    {physicalLocationLabel(d)}
                    {d.hostDeviceId
                      ? ` · Host: ${site.devices.find((x) => x.id === d.hostDeviceId)?.hostname ?? "Not found"}`
                      : ""}
                  </small>
                </button>
              ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              let next = site;
              for (const c of site.cabinets ?? [])
                if (!draft.some((x) => x.id === c.id))
                  next = removeCabinet(next, c.id);
              next = { ...next, cabinets: draft };
              if (!validCabinets(draft) || !validPlacement(next)) {
                setError(
                  "Check cabinet names and capacities. Assigned equipment must fit inside its cabinet.",
                );
                return;
              }
              onChange(next);
              onClose();
            }}
          >
            Save cabinets
          </button>
        </footer>
      </section>
    </div>
  );
}
