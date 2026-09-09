import { useEffect, useState, useRef } from "react";
import type { Cabinet, NetworkDevice, WanConfiguration } from "../types";
import {
  placementIssue,
  validInfrastructureDevice,
} from "../data/infrastructure";
import { CustomSelect, DatePicker, NumberStepper } from "./FormControls";
export function InfrastructureEditor({
  device,
  devices,
  cabinets,
  onSave,
}: {
  device: NetworkDevice;
  devices: NetworkDevice[];
  cabinets: Cabinet[];
  onSave: (d: NetworkDevice) => void;
}) {
  const [draft, setDraft] = useState(device),
    [error, setError] = useState(""),
    [wanIndex, setWanIndex] = useState(0);
  const previousDevice = useRef(device);
  useEffect(() => {
    const previous = previousDevice.current;
    previousDevice.current = device;
    setDraft((current) => {
      if (current.id !== device.id) return device;
      const next = { ...device };
      // Ordinary autosaved edits must not discard pending advanced settings.
      for (const key of [
        "cabinetId",
        "mounting",
        "rackUnit",
        "rackHeight",
        "hostDeviceId",
        "controllerDeviceId",
        "wanInterfaces",
        "securityFeatures",
        "securityLicenceExpiry",
      ] as const) {
        if (JSON.stringify(current[key]) !== JSON.stringify(previous[key]))
          Object.assign(next, { [key]: current[key] });
      }
      return next;
    });
    if (previous.id !== device.id) {
      setError("");
      setWanIndex(0);
    }
  }, [device]);
  const select = (
    key: "cabinetId" | "mounting" | "hostDeviceId" | "controllerDeviceId",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label>
      <span>{label}</span>
      <CustomSelect
        label={label}
        value={String(draft[key] ?? "")}
        options={[{ value: "", label: "Not assigned" }, ...options]}
        onChange={(v) => {
          const next = {
            ...draft,
            [key]: v || undefined,
            ...(key === "mounting" && v === "Rack"
              ? {
                  rackUnit: draft.rackUnit ?? 1,
                  rackHeight: draft.rackHeight ?? 1,
                }
              : {}),
            ...(key === "mounting" && v !== "Rack"
              ? { rackUnit: undefined, rackHeight: undefined }
              : {}),
            ...(key === "mounting" && v === "Virtual"
              ? {
                  cabinetId: undefined,
                  rackUnit: undefined,
                  rackHeight: undefined,
                }
              : {}),
            ...(key === "cabinetId" && !v
              ? { rackUnit: undefined, rackHeight: undefined }
              : {}),
          };
          if (key === "cabinetId") {
            // Save only the cabinet assignment, preserving unsaved advanced edits.
            const saved = {
              ...device,
              cabinetId: v || undefined,
              ...(!v ? { rackUnit: undefined, rackHeight: undefined } : {}),
            };
            const issue = placementIssue(saved, { devices, cabinets });
            if (issue) {
              setError(issue);
              return;
            }
            onSave(saved);
            setError("");
          }
          setDraft(next);
        }}
      />
    </label>
  );
  const wan: WanConfiguration = draft.wanInterfaces?.[wanIndex] ?? {
    method: "Not documented",
    role: "Primary",
    portId: "",
    vlanId: "",
    address: "",
    gateway: "",
    dns: "",
  };
  const gateway = /router|gateway|firewall|modem/i.test(device.deviceType);
  const otherDevices = devices
    .filter((d) => d.id !== device.id)
    .map((d) => ({ value: d.id, label: d.hostname }));
  const updateWan = (patch: Partial<WanConfiguration>) => {
    const entries = [...(draft.wanInterfaces ?? [])];
    entries[wanIndex] = { ...wan, ...patch };
    setDraft({ ...draft, wanInterfaces: entries });
  };
  return (
    <details className="editor-section infrastructure-editor">
      <summary>Location, hosting and advanced configuration</summary>
      <p className="form-help">
        Cabinet selection saves automatically. Save other changes using the
        button below. Keep passwords and private keys in your credential manager.
      </p>
      <h3>Physical placement</h3>
      <div className="form-grid">
        {draft.mounting !== "Virtual" &&
          select(
            "cabinetId",
            "Cabinet",
            cabinets.map((c) => ({
              value: c.id,
              label: [c.room, c.name].filter(Boolean).join(" / "),
            })),
          )}
        {select(
          "mounting",
          "Mounting",
          ["Rack", "Shelf", "Wall", "Desktop", "Virtual"].map((v) => ({
            value: v,
            label: v,
          })),
        )}
        {draft.mounting === "Rack" &&
          draft.cabinetId &&
          (["rackUnit", "rackHeight"] as const).map((key) => (
            <label key={key}>
              <span>
                {key === "rackUnit" ? "Starting rack unit" : "Height (U)"}
              </span>
              <NumberStepper
                label={key === "rackUnit" ? "Starting rack unit" : "Height (U)"}
                min={1}
                max={100}
                value={draft[key] ?? 1}
                onChange={(value) => setDraft({ ...draft, [key]: value })}
              />
            </label>
          ))}
        {select("hostDeviceId", "Runs on host", otherDevices)}
        {select("controllerDeviceId", "Managed by controller", otherDevices)}
      </div>
      {gateway && (
        <>
          <h3>WAN configuration</h3>
          <div className="wan-actions">
            <CustomSelect
              label="WAN interface"
              value={String(wanIndex)}
              options={(draft.wanInterfaces?.length
                ? draft.wanInterfaces
                : [wan]
              ).map((w, i) => ({
                value: String(i),
                label: `Interface ${i + 1} · ${w.role}`,
              }))}
              onChange={(v) => setWanIndex(Number(v))}
            />
            <button
              type="button"
              disabled={(draft.wanInterfaces?.length ?? 0) >= 8}
              onClick={() => {
                const entries = draft.wanInterfaces?.length
                  ? [...draft.wanInterfaces]
                  : [wan];
                setWanIndex(entries.length);
                setDraft({
                  ...draft,
                  wanInterfaces: [
                    ...entries,
                    {
                      method: "Not documented",
                      role: "Backup",
                      portId: "",
                      vlanId: "",
                      address: "",
                      gateway: "",
                      dns: "",
                    },
                  ],
                });
              }}
            >
              Add WAN interface
            </button>
            {!!draft.wanInterfaces?.length && (
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    ...draft,
                    wanInterfaces: draft.wanInterfaces?.filter(
                      (_, i) => i !== wanIndex,
                    ),
                  });
                  setWanIndex(0);
                }}
              >
                Remove WAN interface
              </button>
            )}
          </div>
          <div className="form-grid">
            <label>
              <span>Connection method</span>
              <CustomSelect
                label="WAN connection method"
                value={wan.method}
                options={[
                  "Not documented",
                  "DHCP / IPoE",
                  "PPPoE",
                  "Static IP",
                  "Bridge",
                ].map((v) => ({ value: v, label: v }))}
                onChange={(method) =>
                  updateWan({ method: method as WanConfiguration["method"] })
                }
              />
            </label>
            <label>
              <span>Connection role</span>
              <CustomSelect
                label="WAN connection role"
                value={wan.role}
                options={["Primary", "Backup"].map((v) => ({
                  value: v,
                  label: v,
                }))}
                onChange={(role) =>
                  updateWan({ role: role as WanConfiguration["role"] })
                }
              />
            </label>
            <label>
              <span>WAN / DSL port</span>
              <CustomSelect
                label="WAN port"
                value={wan.portId}
                options={[
                  { value: "", label: "Not assigned" },
                  ...(draft.physicalPorts ?? [])
                    .filter(
                      (p) =>
                        p.enabled && ["WAN", "WAN/LAN", "DSL"].includes(p.role),
                    )
                    .map((p) => ({ value: p.id, label: p.label || p.role })),
                ]}
                onChange={(portId) => updateWan({ portId })}
              />
            </label>
            {(["vlanId", "address", "gateway", "dns"] as const).map((key) => (
              <label key={key}>
                <span>
                  {
                    {
                      vlanId: "WAN VLAN ID (optional)",
                      address: "WAN address / prefix",
                      gateway: "Upstream gateway",
                      dns: "WAN DNS servers",
                    }[key]
                  }
                </span>
                <input
                  maxLength={key === "vlanId" ? 4 : 500}
                  value={wan[key]}
                  onChange={(e) => updateWan({ [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <h3>Security inspection</h3>
          <p className="form-help">
            Record each verified feature independently. Enabling it here
            documents the setting; it does not configure the appliance.
          </p>
          {(["ids", "ips", "webFiltering", "httpsInspection"] as const).map(
            (key) => {
              const feature = draft.securityFeatures?.[key] ?? {
                status: "Not documented",
                details: "",
                lastVerified: "",
              };
              const label = {
                ids: "Intrusion detection (IDS)",
                ips: "Intrusion prevention (IPS)",
                webFiltering: "Web filtering",
                httpsInspection: "HTTPS inspection",
              }[key];
              return (
                <div className="infrastructure-feature" key={key}>
                  <label>
                    <span>{label}</span>
                    <CustomSelect
                      label={label}
                      value={feature.status}
                      options={["Not documented", "Enabled", "Disabled"].map(
                        (v) => ({ value: v, label: v }),
                      )}
                      onChange={(status) =>
                        setDraft({
                          ...draft,
                          securityFeatures: {
                            ...draft.securityFeatures,
                            [key]: { ...feature, status },
                          },
                        })
                      }
                    />
                  </label>
                  <DatePicker
                    label={`${label} verified`}
                    value={feature.lastVerified}
                    onChange={(lastVerified) =>
                      setDraft({
                        ...draft,
                        securityFeatures: {
                          ...draft.securityFeatures,
                          [key]: { ...feature, lastVerified },
                        },
                      })
                    }
                  />
                  <label>
                    <span>Policy / exceptions</span>
                    <textarea
                      maxLength={10000}
                      value={feature.details}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          securityFeatures: {
                            ...draft.securityFeatures,
                            [key]: { ...feature, details: e.target.value },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              );
            },
          )}
          <label>
            <span>Security licence expiry</span>
            <DatePicker
              label="Security licence expiry"
              value={draft.securityLicenceExpiry ?? ""}
              onChange={(securityLicenceExpiry) =>
                setDraft({ ...draft, securityLicenceExpiry })
              }
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary"
        onClick={() => {
          const issue = placementIssue(draft, { devices, cabinets });
          if (issue || !validInfrastructureDevice(draft)) {
            setError(issue || "Check the rack units and WAN VLAN (1–4094).");
            return;
          }
          onSave(draft);
          setError("");
        }}
      >
        Save advanced configuration
      </button>
    </details>
  );
}
