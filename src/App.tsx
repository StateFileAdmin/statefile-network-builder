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
  Settings,
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
import { LocationSettings } from "./components/LocationSettings";
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
import { connectionStatusFor } from "./data/deviceStatus";
import { hasRoutingUpstream } from "./data/topologyChecks";
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
  serviceProvider: "",
  serviceType: "",
  serviceReference: "",
  serviceCost: "",
  wirelessNetworks: "",
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
  lifecycle: "Active",
  position: { x: 300, y: 250 },
});
const defaultDeviceName = (
  template: DeviceTemplate,
  devices: NetworkDevice[],
) => {
  if (template.deviceType.toLowerCase() !== "wireless access point")
    return template.name;
  const used = new Set(
    devices
      .map((device) => /^AP-(\d+)$/i.exec(device.hostname.trim())?.[1])
      .filter((number): number is string => Boolean(number))
      .map(Number),
  );
  let number = 1;
  while (used.has(number)) number += 1;
  return `AP-${String(number).padStart(2, "0")}`;
};
const normaliseDeviceTypes = (register: NetworkRegister) => {
  let changed = false;
  const sites = register.sites.map((site) => ({
    ...site,
    devices: site.devices.map((device) => {
      const type = device.deviceType.trim().toLowerCase(),
        legacyType = type === "wireless network",
        legacyCombinedRouter =
          type.includes("router") &&
          (type.includes("wi-fi") ||
            type.includes("wifi") ||
            type.includes("wireless")),
        normalisedType = legacyType
          ? "Wireless access point"
          : legacyCombinedRouter
            ? "Router"
            : device.deviceType,
        operatingMode =
          device.operatingMode ??
          (normalisedType === "Router"
            ? legacyCombinedRouter
              ? "Router + wireless access point"
              : "Router only"
            : undefined),
        isInternetService = normalisedType === "Internet service",
        serviceProvider = isInternetService
          ? device.serviceProvider?.trim() || device.manufacturer
          : device.serviceProvider,
        serviceType = isInternetService
          ? device.serviceType?.trim() || device.model
          : device.serviceType,
        needsServiceMigration =
          isInternetService &&
          (serviceProvider !== device.serviceProvider ||
            serviceType !== device.serviceType ||
            Boolean(device.manufacturer || device.model));
      if (
        !legacyType &&
        !legacyCombinedRouter &&
        operatingMode === device.operatingMode &&
        !needsServiceMigration
      )
        return device;
      changed = true;
      return {
        ...device,
        deviceType: normalisedType,
        operatingMode,
        serviceProvider,
        serviceType,
        manufacturer: isInternetService ? "" : device.manufacturer,
        model: isInternetService ? "" : device.model,
      };
    }),
  }));
  const normalisedSites = sites.map((site) => ({
    ...site,
    connections: site.connections.map((connection) => {
      const source = site.devices.find(
          (device) => device.id === connection.source,
        ),
        target = site.devices.find((device) => device.id === connection.target),
        status = connectionStatusFor(source, target, connection.status);
      if (status === connection.status) return connection;
      changed = true;
      return { ...connection, status };
    }),
  }));
  return changed
    ? {
        ...register,
        sites: normalisedSites,
        updatedAt: new Date().toISOString(),
      }
    : register;
};
const readRoute = () => {
  const parts = window.location.hash.slice(1).split("/"),
    views: View[] = ["topology", "assets", "ip-plan", "report"];
  if (parts[0] !== "site")
    return {
      page: "dashboard" as const,
      siteId: "",
      view: "topology" as View,
    };
  let siteId = "";
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
    [paletteOpen, setPaletteOpen] = useState(false),
    [pendingAttachment, setPendingAttachment] = useState<{
      sourceId: string;
      side: "before" | "after";
    } | null>(null),
    [pendingPosition, setPendingPosition] = useState<{
      x: number;
      y: number;
    } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(""),
    [sync, setSync] = useState<SyncState>("idle"),
    [user, setUser] = useState<CurrentUser | null>(null),
    [accountOpen, setAccountOpen] = useState(false),
    [locationSettingsOpen, setLocationSettingsOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [topologyDragging, setTopologyDragging] = useState(false),
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
        const normalisedRegister = normaliseDeviceTypes(loaded.register);
        versionRef.current = loaded.version;
        syncedRef.current = loaded.register;
        setRegister(normalisedRegister);
        setUser(session);
        document.documentElement.dataset.role = session.role;
        clearLegacyLocalData();
        if (!normalisedRegister.sites.some((s) => s.id === siteId))
          setSiteId(normalisedRegister.sites[0]?.id || "");
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
    if (!register || register === syncedRef.current || topologyDragging) return;
    const timer = window.setTimeout(() => {
      void persist(register);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [register, topologyDragging]);

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
  const cleanUpTopology = () => {
    updateSite((current) => {
      const ids = new Set(current.devices.map((device) => device.id)),
        outgoing = new globalThis.Map<string, string[]>(),
        incoming = new globalThis.Map(
          current.devices.map((device) => [device.id, 0]),
        );
      current.connections.forEach((connection) => {
        if (!ids.has(connection.source) || !ids.has(connection.target)) return;
        outgoing.set(connection.source, [
          ...(outgoing.get(connection.source) ?? []),
          connection.target,
        ]);
        incoming.set(
          connection.target,
          (incoming.get(connection.target) ?? 0) + 1,
        );
      });
      const levels = new globalThis.Map<string, number>(),
        queue = current.devices
          .filter((device) => (incoming.get(device.id) ?? 0) === 0)
          .map((device) => device.id);
      if (!queue.length && current.devices[0])
        queue.push(current.devices[0].id);
      queue.forEach((id) => levels.set(id, 0));
      for (let index = 0; index < queue.length; index += 1) {
        const id = queue[index],
          level = levels.get(id) ?? 0;
        for (const target of outgoing.get(id) ?? []) {
          const nextLevel = Math.max(levels.get(target) ?? 0, level + 1);
          if (!levels.has(target)) queue.push(target);
          levels.set(target, nextLevel);
        }
      }
      current.devices.forEach((device) => {
        if (!levels.has(device.id)) levels.set(device.id, 0);
      });
      const columns = new globalThis.Map<number, NetworkDevice[]>();
      current.devices.forEach((device) => {
        const level = levels.get(device.id) ?? 0;
        columns.set(level, [...(columns.get(level) ?? []), device]);
      });
      columns.forEach((devices) =>
        devices.sort((a, b) => a.position.y - b.position.y),
      );
      return {
        ...current,
        devices: current.devices.map((device) => {
          const level = levels.get(device.id) ?? 0,
            column = columns.get(level) ?? [],
            row = column.findIndex((item) => item.id === device.id);
          return {
            ...device,
            position: { x: 48 + level * 288, y: 72 + row * 144 },
          };
        }),
      };
    });
    showNotice("Diagram cleaned up");
  };
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
    updateSite((s) => {
      const devices = s.devices.some((d) => d.id === device.id)
        ? s.devices.map((d) => (d.id === device.id ? device : d))
        : [...s.devices, device];
      return {
        ...s,
        devices,
        connections: s.connections.map((connection) => {
          const source = devices.find((d) => d.id === connection.source),
            target = devices.find((d) => d.id === connection.target);
          const status = connectionStatusFor(source, target, connection.status);
          return status === connection.status
            ? connection
            : { ...connection, status };
        }),
      };
    });
    setSelection({ kind: "device", id: device.id });
  };
  const removeDevice = (id: string) =>
    setActionDialog({
      title: "Remove this device?",
      message:
        "The device and all of its connections will be removed from the current draft. You can restore an earlier published version from Publication History.",
      confirmLabel: "Remove device",
      onConfirm: () => {
        updateSite((s) => ({
          ...s,
          devices: s.devices.filter((device) => device.id !== id),
          connections: s.connections.filter(
            (connection) =>
              connection.source !== id && connection.target !== id,
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
  };
  const removeConnection = (id: string) =>
    setActionDialog({
      title: "Remove this connection?",
      message:
        "The connection will be removed from the current draft. You can restore an earlier published version from Publication History.",
      confirmLabel: "Remove connection",
      onConfirm: () => {
        updateSite((s) => ({
          ...s,
          connections: s.connections.filter(
            (connection) => connection.id !== id,
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
            position: pendingPosition ?? base.position,
            hostname: defaultDeviceName(template, site.devices),
            deviceType: template.deviceType,
            operatingMode:
              template.deviceType === "Router" ? "Router only" : undefined,
            connectionType: template.connectionType,
            notes: "",
            state: template.state || "Current",
            lifecycle: template.state === "Future" ? "Planned" : "Active",
            quantity: template.deviceType === "Camera group" ? 1 : undefined,
            status: template.status || "Needs Verification",
          }
        : base;
    saveDevice(d);
    setPendingPosition(null);
    setView("topology");
    setPaletteOpen(false);
  };
  const openDeviceMenu = (position?: { x: number; y: number }) => {
    setPendingAttachment(null);
    setPendingPosition(position ?? null);
    setPaletteOpen(true);
  };
  const openAttachedDeviceMenu = (
    sourceId: string,
    side: "before" | "after",
  ) => {
    setPendingPosition(null);
    setPendingAttachment({ sourceId, side });
    setPaletteOpen(true);
  };
  const addAttachedDevice = (template: DeviceTemplate) => {
    if (!pendingAttachment) return;
    const { sourceId, side } = pendingAttachment;
    const source = site.devices.find((device) => device.id === sourceId);
    if (!source) return;
    const horizontal = side === "after" ? 288 : -288,
      affectedConnections = site.connections.filter((connection) =>
        side === "after"
          ? connection.source === source.id
          : connection.target === source.id,
      ),
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
    if (affectedConnections.length)
      position = {
        x: source.position.x + horizontal,
        y: source.position.y,
      };
    const device: NetworkDevice = {
        ...blankDevice(),
        position,
        hostname: defaultDeviceName(template, site.devices),
        deviceType: template.deviceType,
        operatingMode:
          template.deviceType === "Router" ? "Router only" : undefined,
        connectionType: template.connectionType,
        notes: "",
        state: template.state || "Current",
        lifecycle: template.state === "Future" ? "Planned" : "Active",
        quantity: template.deviceType === "Camera group" ? 1 : undefined,
        status: template.status || "Needs Verification",
      },
      connection: NetworkConnection = {
        id: uid("connection"),
        source: side === "after" ? source.id : device.id,
        target: side === "after" ? device.id : source.id,
        label: "",
        connectionType: "Ethernet",
        status: connectionStatusFor(source, device, "Needs Verification"),
        state: "Current",
      };
    updateSite((current) => {
      const shiftedDevices = affectedConnections.length
        ? current.devices.map((currentDevice) => {
            const isBeyondSource =
              side === "after"
                ? currentDevice.position.x > source.position.x
                : currentDevice.position.x < source.position.x;
            return isBeyondSource
              ? {
                  ...currentDevice,
                  position: {
                    ...currentDevice.position,
                    x: currentDevice.position.x + horizontal,
                  },
                }
              : currentDevice;
          })
        : current.devices;
      if (!affectedConnections.length)
        return {
          ...current,
          devices: [...shiftedDevices, device],
          connections: [...current.connections, connection],
        };
      const affectedIds = new Set(
          affectedConnections.map((existing) => existing.id),
        ),
        rewired = affectedConnections.map((existing) => ({
          ...existing,
          source: side === "after" ? device.id : existing.source,
          target: side === "after" ? existing.target : device.id,
        }));
      return {
        ...current,
        devices: [...shiftedDevices, device],
        connections: [
          ...current.connections.filter(
            (existing) => !affectedIds.has(existing.id),
          ),
          connection,
          ...rewired,
        ],
      };
    });
    setPendingAttachment(null);
    setPaletteOpen(false);
    setSelection({ kind: "device", id: device.id });
    showNotice("Attached device added");
  };
  const connect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const source = site.devices.find((device) => device.id === c.source),
      target = site.devices.find((device) => device.id === c.target);
    saveConnection({
      id: uid("connection"),
      source: c.source,
      target: c.target,
      label: "",
      connectionType: "Ethernet",
      status: connectionStatusFor(source, target, "Needs Verification"),
      state: "Current",
    });
    showNotice("Connection added");
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
      ["topology", "Diagram", Map],
      ["assets", "Assets", Boxes],
      ["ip-plan", "IP plan", CircleDot],
      ["report", "Report", Printer],
    ],
    known = visibleSite.devices.filter((d) => d.status === "Known").length,
    unknown = visibleSite.devices.filter(
      (d) => d.status === "Needs Verification",
    ).length,
    planned = visibleSite.devices.filter(
      (d) =>
        d.lifecycle === "Planned" ||
        d.status === "Planned" ||
        d.state === "Future",
    ).length;
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
          <div className="brand-copy">
            {page === "site" ? (
              <input
                className="flow-title-input"
                aria-label="Location name"
                value={site.name}
                size={Math.min(24, Math.max(8, site.name.length || 1))}
                onChange={(event) =>
                  updateSite((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                onBlur={() => {
                  if (!site.name.trim())
                    updateSite((current) => ({
                      ...current,
                      name: "Untitled network",
                    }));
                }}
              />
            ) : (
              <b>Network Builder</b>
            )}
            <small>
              {page === "site"
                ? "Network diagram"
                : "Infrastructure source of truth"}
            </small>
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
                className={`quiet ${isPublished ? "published-button" : "unpublished-button"}`}
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
          {page === "site" && (
            <button
              className="icon-button account-button"
              title="Location settings"
              aria-label="Open location settings"
              onClick={() => setLocationSettingsOpen(true)}
            >
              <Settings size={19} />
            </button>
          )}
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
                <button onClick={() => openDeviceMenu()}>
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
                    onConnectionDelete={removeConnection}
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
                    onDragStateChange={setTopologyDragging}
                    onConnect={connect}
                    onQuickAdd={openAttachedDeviceMenu}
                    onAddAt={openDeviceMenu}
                    onCleanUp={cleanUpTopology}
                  />
                ) : (
                  <div className="empty-state">
                    <Network size={36} />
                    <h2>No diagram recorded</h2>
                    <p>Add the first device to begin documenting this site.</p>
                    <button
                      className="primary"
                      onClick={() => openDeviceMenu()}
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
                onAdd={() => openDeviceMenu()}
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
                <ManagementReport
                  site={visibleSite}
                  version={versionRef.current}
                />
              </>
            )}
          </main>
        </>
      )}
      {selectedDevice && (
        <Drawer
          kind="device"
          value={selectedDevice}
          routingWarning={hasRoutingUpstream(
            selectedDevice.id,
            site.devices,
            site.connections,
          )}
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
          onAdd={(template) =>
            pendingAttachment
              ? addAttachedDevice(template)
              : newDevice(template)
          }
          onClose={() => {
            setPaletteOpen(false);
            setPendingAttachment(null);
            setPendingPosition(null);
          }}
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
      {locationSettingsOpen && page === "site" && (
        <LocationSettings
          name={site.name}
          address={site.address}
          description={site.description}
          onChange={(change) =>
            updateSite((current) => ({ ...current, ...change }))
          }
          onClose={() => setLocationSettingsOpen(false)}
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
