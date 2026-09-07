import { useEffect, useRef, useState } from "react";
import type { Connection } from "@xyflow/react";
import {
  AlertTriangle,
  Boxes,
  CircleDot,
  ChevronDown,
  Download,
  FileJson,
  LayoutDashboard,
  Map,
  Network,
  Plus,
  Printer,
  UserRound,
  Upload,
  UploadCloud,
} from "lucide-react";
import { Topology } from "./components/Topology";
import { Drawer } from "./components/Drawer";
import { AssetRegister, IpPlan } from "./components/Registers";
import { ManagementReport } from "./components/Report";
import { DevicePalette, type DeviceTemplate } from "./components/DevicePalette";
import { Dashboard } from "./components/Dashboard";
import { CustomSelect } from "./components/FormControls";
import { AccountPanel, type CurrentUser } from "./components/AccountPanel";
import { PublicationHistoryDialog } from "./components/PublishDialog";
import {
  ActionDialog,
  type ActionDialogRequest,
} from "./components/ActionDialog";
import "./components/SiteSelect.css";
import "./components/AppTheme.css";
import {
  ConflictError,
  SessionExpiredError,
  authenticatedFetch,
  clearLegacyLocalData,
  isCloudMode,
  createExportPackage,
  registerRepository,
  validateImport,
} from "./data/storage";
import { MAX_REGISTER_BYTES } from "./data/validation";
import type {
  NetworkConnection,
  NetworkDevice,
  NetworkRegister,
  Site,
  SiteRelationship,
} from "./types";
type View = "topology" | "assets" | "ip-plan" | "report";
type Selection = { kind: "device" | "connection"; id: string } | null;
type SyncState = "idle" | "saving" | "saved" | "error";
const SAVE_DEBOUNCE_MS = 700;
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const blankDevice = (): NetworkDevice => ({
  id: uid("device"),
  hostname: "New device",
  deviceType: "Network device",
  manufacturer: "",
  model: "",
  managementIp: "",
  subnetVlan: "",
  macAddress: "",
  serialNumber: "",
  connectionType: "",
  physicalLocation: "",
  switchPort: "",
  notes: "",
  lastVerified: "",
  status: "Needs Verification",
  state: "Current",
  position: { x: 300, y: 250 },
});
const readRoute = () => {
  const parts = window.location.hash.slice(1).split("/"),
    views: View[] = ["topology", "assets", "ip-plan", "report"];
  if (parts[0] !== "site")
    return {
      page: "dashboard" as const,
      siteId: "west-perth",
      view: "topology" as View,
    };
  let siteId = "west-perth";
  try {
    siteId = decodeURIComponent(parts[1] || siteId);
  } catch {
    /* use the default site */
  }
  return {
    page: "site" as const,
    siteId,
    view: views.includes(parts[2] as View) ? (parts[2] as View) : "topology",
  };
};
export function App() {
  const initialRoute = useRef(readRoute()).current;
  const [register, setRegister] = useState<NetworkRegister | null>(null),
    [siteId, setSiteId] = useState(initialRoute.siteId),
    [page, setPage] = useState<"dashboard" | "site">(initialRoute.page),
    [view, setView] = useState<View>(initialRoute.view),
    [selection, setSelection] = useState<Selection>(null),
    [notice, setNotice] = useState(""),
    [paletteOpen, setPaletteOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(""),
    [sync, setSync] = useState<SyncState>("idle"),
    [user, setUser] = useState<CurrentUser | null>(null),
    [accountOpen, setAccountOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [publishing, setPublishing] = useState(false),
    [publishedVersion, setPublishedVersion] = useState<number | null>(null),
    [publishedAt, setPublishedAt] = useState<string | null>(null),
    [actionDialog, setActionDialog] = useState<ActionDialogRequest | null>(
      null,
    );
  // Version last read from the server; sent back on save so a stale write is rejected.
  const versionRef = useRef(0);
  // The register object the server holds, compared by reference so the save
  // effect can tell a real edit from simply adopting server state.
  const syncedRef = useRef<NetworkRegister | null>(null);

  const endSession = () => {
    syncedRef.current = null;
    setRegister(null);
    window.location.reload();
  };

  const persist = async (next: NetworkRegister) => {
    try {
      setSync("saving");
      const { version } = await registerRepository.save(
        next,
        versionRef.current,
      );
      versionRef.current = version;
      syncedRef.current = next;
      setSync("saved");
    } catch (error) {
      if (error instanceof SessionExpiredError) return endSession();
      if (error instanceof ConflictError) {
        versionRef.current = error.latest.version;
        syncedRef.current = error.latest.register;
        setRegister(error.latest.register);
        setSync("idle");
        setActionDialog({
          title: "A newer version was saved",
          message: `${error.message} The register has been refreshed with their version. Re-apply your change to the current draft.`,
          confirmLabel: "Continue",
          tone: "info",
          onConfirm: () => {},
        });
        return;
      }
      setSync("error");
      showNotice("Could not save to the server. Your change is not stored.");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [loaded, session] = await Promise.all([
          registerRepository.load(),
          registerRepository.session(),
        ]);
        versionRef.current = loaded.version;
        syncedRef.current = loaded.register;
        setRegister(loaded.register);
        setUser(session);
        document.documentElement.dataset.role = session.role;
        clearLegacyLocalData();
        if (!loaded.register.sites.some((s) => s.id === siteId))
          setSiteId(loaded.register.sites[0]?.id || "");
      } catch (error) {
        if (error instanceof SessionExpiredError) return endSession();
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load the register.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!register || register === syncedRef.current) return;
    const timer = window.setTimeout(() => {
      void persist(register);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [register]);

  useEffect(() => {
    const hash =
      page === "dashboard"
        ? "#dashboard"
        : `#site/${encodeURIComponent(siteId)}/${view}`;
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", hash);
  }, [page, siteId, view]);
  useEffect(() => {
    if (!register || page !== "site" || sync === "saving") return;
    void authenticatedFetch(
      `/api/publications?siteId=${encodeURIComponent(siteId)}`,
    )
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          publications?: { register_version: number; published_at: string }[];
        };
        setPublishedVersion(result.publications?.[0]?.register_version ?? null);
        setPublishedAt(result.publications?.[0]?.published_at ?? null);
      })
      .catch(() => {});
  }, [siteId, page, sync, historyOpen, register]);
  if (loadError)
    return (
      <div className="loading">
        <AlertTriangle />
        <span>{loadError}</span>
        <button className="quiet" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  if (!register)
    return (
      <div className="loading">
        <Network />
        <span>Loading network register…</span>
      </div>
    );
  const site = register.sites.find((s) => s.id === siteId) ?? register.sites[0];
  if (!site) return <div className="loading">No sites are configured.</div>;
  const isVisibleRemoval = (item: { status: string; removedAt?: string }) =>
      item.status !== "Removed" ||
      !item.removedAt ||
      !publishedAt ||
      new Date(item.removedAt).getTime() > new Date(publishedAt).getTime(),
    visibleDevices = site.devices.filter(isVisibleRemoval),
    visibleDeviceIds = new Set(visibleDevices.map((device) => device.id)),
    visibleConnections = site.connections.filter(
      (connection) =>
        isVisibleRemoval(connection) &&
        visibleDeviceIds.has(connection.source) &&
        visibleDeviceIds.has(connection.target),
    ),
    visibleSite = {
      ...site,
      devices: visibleDevices,
      connections: visibleConnections,
    };
  const updateSite = (fn: (s: Site) => Site) =>
    setRegister({
      ...register,
      updatedAt: new Date().toISOString(),
      sites: register.sites.map((s) => (s.id === site.id ? fn(s) : s)),
    });
  const openSite = (id: string) => {
    setSiteId(id);
    setPage("site");
    setSelection(null);
  };
  const addSite = (newSite: Site) => {
    setRegister({
      ...register,
      updatedAt: new Date().toISOString(),
      sites: [...register.sites, newSite],
    });
    openSite(newSite.id);
    showNotice("Location added");
  };
  const saveSiteRelationship = (relationship: SiteRelationship) => {
    const links = register.siteRelationships ?? [];
    setRegister({
      ...register,
      updatedAt: new Date().toISOString(),
      siteRelationships: links.some((link) => link.id === relationship.id)
        ? links.map((link) =>
            link.id === relationship.id ? relationship : link,
          )
        : [...links, relationship],
    });
    showNotice("Site relationship saved");
  };
  const deleteSiteRelationship = (id: string) =>
    setActionDialog({
      title: "Remove this site relationship?",
      message:
        "The relationship will be removed from the organisation map when the draft saves.",
      confirmLabel: "Remove relationship",
      onConfirm: () => {
        setRegister({
          ...register,
          updatedAt: new Date().toISOString(),
          siteRelationships: (register.siteRelationships ?? []).filter(
            (link) => link.id !== id,
          ),
        });
        showNotice("Site relationship removed");
      },
    });
  const selectedDevice =
      selection?.kind === "device"
        ? site.devices.find((d) => d.id === selection.id)
        : undefined,
    selectedConnection =
      selection?.kind === "connection"
        ? site.connections.find((c) => c.id === selection.id)
        : undefined;
  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }
  const saveDevice = (device: NetworkDevice) => {
    updateSite((s) => ({
      ...s,
      devices: s.devices.some((d) => d.id === device.id)
        ? s.devices.map((d) => (d.id === device.id ? device : d))
        : [...s.devices, device],
    }));
    setSelection({ kind: "device", id: device.id });
    showNotice("Device saved");
  };
  const removeDevice = (id: string) =>
    setActionDialog({
      title: "Remove this device?",
      message:
        "The device and its connections will remain as a red draft ghost until this location is published.",
      confirmLabel: "Remove device",
      onConfirm: () => {
        const removedAt = new Date().toISOString();
        updateSite((s) => ({
          ...s,
          devices: s.devices.map((device) =>
            device.id === id
              ? { ...device, status: "Removed", removedAt }
              : device,
          ),
          connections: s.connections.map((connection) =>
            connection.source === id || connection.target === id
              ? { ...connection, status: "Removed", removedAt }
              : connection,
          ),
        }));
        setSelection(null);
        showNotice("Device removed");
      },
    });
  const saveConnection = (connection: NetworkConnection) => {
    updateSite((s) => ({
      ...s,
      connections: s.connections.some((c) => c.id === connection.id)
        ? s.connections.map((c) => (c.id === connection.id ? connection : c))
        : [...s.connections, connection],
    }));
    setSelection({ kind: "connection", id: connection.id });
    showNotice("Connection saved");
  };
  const removeConnection = (id: string) =>
    setActionDialog({
      title: "Remove this connection?",
      message:
        "The link will remain as a red draft ghost until this location is published.",
      confirmLabel: "Remove connection",
      onConfirm: () => {
        updateSite((s) => ({
          ...s,
          connections: s.connections.map((connection) =>
            connection.id === id
              ? {
                  ...connection,
                  status: "Removed",
                  removedAt: new Date().toISOString(),
                }
              : connection,
          ),
        }));
        setSelection(null);
        showNotice("Connection removed");
      },
    });
  const newDevice = (template?: DeviceTemplate) => {
    const base = blankDevice(),
      d: NetworkDevice = template
        ? {
            ...base,
            hostname: template.name,
            deviceType: template.deviceType,
            connectionType: template.connectionType,
            notes: template.notes,
            state: template.state || "Current",
            status: template.status || "Needs Verification",
          }
        : base;
    saveDevice(d);
    setView("topology");
    setPaletteOpen(false);
  };
  const addDeviceAt = (position: { x: number; y: number }) => {
    const device = { ...blankDevice(), position };
    updateSite((current) => ({
      ...current,
      devices: [...current.devices, device],
    }));
    setSelection({ kind: "device", id: device.id });
    showNotice("Device added");
  };
  const addAttachedDevice = (sourceId: string, side: "before" | "after") => {
    const source = site.devices.find((device) => device.id === sourceId);
    if (!source) return;
    const horizontal = side === "after" ? 288 : -288,
      offsets = [0, 144, -144, 288, -288, 432, -432],
      occupied = (position: { x: number; y: number }) =>
        visibleSite.devices.some(
          (device) =>
            Math.abs(device.position.x - position.x) < 250 &&
            Math.abs(device.position.y - position.y) < 125,
        );
    let position = {
      x: source.position.x + horizontal,
      y: source.position.y,
    };
    for (const lane of [1, 2, 3]) {
      const candidateX = source.position.x + horizontal * lane;
      const available = offsets
        .map((offset) => ({ x: candidateX, y: source.position.y + offset }))
        .find((candidate) => !occupied(candidate));
      if (available) {
        position = available;
        break;
      }
    }
    const device = { ...blankDevice(), position },
      connection: NetworkConnection = {
        id: uid("connection"),
        source: side === "after" ? source.id : device.id,
        target: side === "after" ? device.id : source.id,
        label: "New connection",
        connectionType: "Ethernet",
        status: "Needs Verification",
        state: "Current",
      };
    updateSite((current) => ({
      ...current,
      devices: [...current.devices, device],
      connections: [...current.connections, connection],
    }));
    setSelection({ kind: "device", id: device.id });
    showNotice("Attached device added");
  };
  const connect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    saveConnection({
      id: uid("connection"),
      source: c.source,
      target: c.target,
      label: "New connection",
      connectionType: "Ethernet",
      status: "Needs Verification",
      state: "Current",
    });
  };
  const exportJson = () => {
    const portablePackage = createExportPackage(register),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(portablePackage, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `network-register-${new Date().toISOString().slice(0, 10)}.network-register.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice("Portable register package exported");
  };
  const importJson = async (file: File) => {
    try {
      if (file.size > MAX_REGISTER_BYTES)
        throw new Error("This register is too large to import safely.");
      const next = validateImport(JSON.parse(await file.text()));
      setRegister(next);
      setSiteId(next.sites[0]?.id || "");
      setSelection(null);
      showNotice("Network register imported");
    } catch (e) {
      setActionDialog({
        title: "The register was not imported",
        message:
          e instanceof Error
            ? e.message
            : "The selected file could not be read.",
        confirmLabel: "Choose another file",
        tone: "info",
        onConfirm: () => importRef.current?.click(),
      });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };
  const generateReport = () => {
    setSelection(null);
    setPage("site");
    setView("report");
    window.setTimeout(() => window.print(), 250);
  };
  const tabs: [View, string, typeof Map][] = [
      ["topology", "Topology", Map],
      ["assets", "Assets", Boxes],
      ["ip-plan", "IP plan", CircleDot],
      ["report", "Report", Printer],
    ],
    known = visibleSite.devices.filter((d) => d.status === "Known").length,
    unknown = visibleSite.devices.filter(
      (d) => d.status === "Needs Verification",
    ).length,
    planned = visibleSite.devices.filter((d) => d.status === "Planned").length;
  const isAdmin = user?.role === "admin",
    isPublished =
      publishedVersion === versionRef.current &&
      sync !== "saving" &&
      sync !== "error";
  const publishSite = async () => {
    if (isPublished || publishing || sync === "saving" || sync === "error")
      return;
    setPublishing(true);
    try {
      const response = await authenticatedFetch("/api/publications", {
          method: "POST",
          body: JSON.stringify({
            siteId: site.id,
            version: versionRef.current,
            releaseNote: "",
          }),
        }),
        data = (await response.json()) as {
          error?: string;
          publishedVersion?: number;
          publishedAt?: string;
        };
      if (!response.ok)
        throw new Error(
          data.error === "conflict"
            ? "A newer draft exists. Refresh before publishing."
            : data.error || "Could not publish this location.",
        );
      if (data.publishedVersion !== undefined)
        setPublishedVersion(data.publishedVersion);
      if (data.publishedAt) setPublishedAt(data.publishedAt);
      showNotice("Location published");
    } catch (cause) {
      if (cause instanceof SessionExpiredError) return endSession();
      showNotice(
        cause instanceof Error
          ? cause.message
          : "Could not publish this location.",
      );
    } finally {
      setPublishing(false);
    }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <img src="/statefile-mark.svg" alt="" />
          </span>
          <div>
            <b>Network Builder</b>
            <small>Infrastructure source of truth</small>
          </div>
        </div>
        <div className="header-navigation">
          <button
            className={`dashboard-button ${page === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setPage("dashboard");
              setSelection(null);
            }}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <div className="header-site-select">
            <CustomSelect
              label="Active location"
              value={site.id}
              options={register.sites.map((s) => ({
                value: s.id,
                label: s.name,
                description: s.address || "Address not recorded",
              }))}
              onChange={openSite}
            />
          </div>
        </div>
        <div className="header-actions">
          <span
            className={`sync-chip sync-${sync}`}
            title={user ? `Signed in as ${user.email}` : undefined}
          >
            {sync === "saving"
              ? "Saving…"
              : sync === "error"
                ? "Not saved"
                : sync === "saved"
                  ? "Draft saved"
                  : user?.email || "Shared register"}
          </span>
          {page === "site" && (
            <div className="publish-split">
              <button
                className={`quiet ${isPublished ? "published-button" : ""}`}
                disabled={
                  isPublished ||
                  publishing ||
                  sync === "saving" ||
                  sync === "error"
                }
                onClick={() => void publishSite()}
              >
                <UploadCloud size={16} />
                {publishing
                  ? "Publishing…"
                  : isPublished
                    ? "PUBLISHED"
                    : "Publish"}
              </button>
              <button
                className="quiet publish-history-button"
                title="Publication history"
                aria-label="Open publication history"
                onClick={() => setHistoryOpen(true)}
              >
                <ChevronDown size={15} />
              </button>
            </div>
          )}
          {isAdmin && (
            <>
              <button
                className="quiet"
                onClick={() => importRef.current?.click()}
              >
                <Upload size={16} /> Import
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(e) =>
                  e.target.files?.[0] && void importJson(e.target.files[0])
                }
              />
              <button className="quiet" onClick={exportJson}>
                <Download size={16} /> Export package
              </button>
            </>
          )}
          <button className="primary" onClick={generateReport}>
            <Printer size={16} /> Generate report
          </button>
          {isCloudMode && (
            <button
              className="icon-button account-button"
              title="Account and access"
              onClick={() => setAccountOpen(true)}
            >
              <UserRound size={19} />
            </button>
          )}
        </div>
      </header>
      {page === "dashboard" ? (
        <Dashboard
          canManage={isAdmin}
          sites={register.sites}
          relationships={register.siteRelationships ?? []}
          onOpenSite={openSite}
          onAddSite={addSite}
          onSaveRelationship={saveSiteRelationship}
          onDeleteRelationship={deleteSiteRelationship}
        />
      ) : (
        <>
          <nav className="view-tabs">
            {tabs.map(([id, label, Icon]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => {
                  setView(id);
                  setSelection(null);
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <span className="tab-spacer" />
            <div className="strip-site-stats">
              <span className="known">
                <b>{known}</b> Known
              </span>
              <span className={unknown ? "warning" : ""}>
                <b>{unknown}</b> To verify
              </span>
              <span className="planned">
                <b>{planned}</b> Planned
              </span>
            </div>
            {view === "topology" && (
              <>
                <span className="canvas-help">
                  Drag to arrange · connect using node handles
                </span>
                <button onClick={() => setPaletteOpen(true)}>
                  <Plus size={16} /> Add device
                </button>
              </>
            )}
          </nav>
          <main className={`main-view view-${view}`}>
            {view === "topology" && (
              <div className="canvas-frame">
                <div className="state-legend">
                  <span>
                    <i className="known" />
                    Known
                  </span>
                  <span>
                    <i className="unknown" />
                    Needs verification
                  </span>
                  <span>
                    <i className="planned" />
                    Planned / retired
                  </span>
                  <span>
                    <i className="danger" />
                    Compromised / removed
                  </span>
                </div>
                {visibleSite.devices.length ? (
                  <Topology
                    devices={visibleSite.devices}
                    connections={visibleSite.connections}
                    onDeviceClick={(id) => setSelection({ kind: "device", id })}
                    onConnectionClick={(id) =>
                      setSelection({ kind: "connection", id })
                    }
                    onMoveMany={(positions) => {
                      const moved = new globalThis.Map(
                        positions.map((item) => [item.id, item.position]),
                      );
                      updateSite((s) => ({
                        ...s,
                        devices: s.devices.map((device) => ({
                          ...device,
                          position: moved.get(device.id) ?? device.position,
                        })),
                      }));
                    }}
                    onConnect={connect}
                    onQuickAdd={addAttachedDevice}
                    onAddAt={addDeviceAt}
                  />
                ) : (
                  <div className="empty-state">
                    <Network size={36} />
                    <h2>No topology recorded</h2>
                    <p>Add the first device to begin documenting this site.</p>
                    <button
                      className="primary"
                      onClick={() => setPaletteOpen(true)}
                    >
                      <Plus size={16} /> Choose a component
                    </button>
                  </div>
                )}
              </div>
            )}
            {view === "assets" && (
              <AssetRegister
                devices={visibleSite.devices}
                onEdit={(id) => setSelection({ kind: "device", id })}
                onAdd={() => setPaletteOpen(true)}
              />
            )}{" "}
            {view === "ip-plan" && (
              <IpPlan
                canDelete={isAdmin}
                entries={site.ipPlan}
                onChange={(ipPlan) => updateSite((s) => ({ ...s, ipPlan }))}
              />
            )}{" "}
            {view === "report" && (
              <>
                <div className="report-toolbar no-print">
                  <div>
                    <AlertTriangle size={16} />
                    <span>
                      Public WAN IPs are excluded by default. Use “Generate
                      report” to print or save as PDF.
                    </span>
                  </div>
                  <button className="primary" onClick={() => window.print()}>
                    <Printer size={16} /> Print / save PDF
                  </button>
                </div>
                <ManagementReport site={visibleSite} />
              </>
            )}
          </main>
        </>
      )}
      {selectedDevice && (
        <Drawer
          kind="device"
          value={selectedDevice}
          onSave={saveDevice}
          onDelete={isAdmin ? () => removeDevice(selectedDevice.id) : undefined}
          onClose={() => setSelection(null)}
        />
      )}{" "}
      {selectedConnection && (
        <Drawer
          kind="connection"
          value={selectedConnection}
          deviceNames={Object.fromEntries(
            site.devices.map((d) => [d.id, d.hostname]),
          )}
          onSave={saveConnection}
          onDelete={
            isAdmin ? () => removeConnection(selectedConnection.id) : undefined
          }
          onClose={() => setSelection(null)}
        />
      )}{" "}
      {paletteOpen && (
        <DevicePalette
          onAdd={newDevice}
          onClose={() => setPaletteOpen(false)}
        />
      )}{" "}
      {historyOpen && (
        <PublicationHistoryDialog
          site={site}
          canRestore={isAdmin && isCloudMode}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => window.location.reload()}
        />
      )}{" "}
      {accountOpen && user && (
        <AccountPanel
          user={user}
          sites={register.sites}
          onClose={() => setAccountOpen(false)}
        />
      )}{" "}
      {actionDialog && (
        <ActionDialog
          request={actionDialog}
          onClose={() => setActionDialog(null)}
        />
      )}{" "}
      {notice && (
        <div className="toast">
          <FileJson size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
