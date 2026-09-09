import { RemoteOfficeNode } from "./RemoteOfficeNode";
import type { Site, SiteRelationship } from "../types";
import { CabinetGroups } from "./CabinetGroups";
import type { Cabinet } from "../types";
import { TOPOLOGY_GRID, snapTopologyPosition } from "../data/topologyGrid";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  SelectionMode,
  type ReactFlowInstance,
  ReactFlow,
  getBezierPath,
  useNodesState,
  useUpdateNodeInternals,
  type Connection,
  type EdgeProps,
  type NodeProps,
  type OnConnectEnd,
} from "@xyflow/react";
import {
  Cable,
  CreditCard,
  AlertTriangle,
  CircleHelp,
  EthernetPort,
  Radio,
  Router,
  Server,
  Shield,
  Users,
  Video,
  Wifi,
  Plus,
  WandSparkles,
  Trash2,
} from "lucide-react";
import type {
  DeviceLifecycle,
  NetworkConnection,
  NetworkDevice,
  TopologyEdge,
  TopologyNode,
} from "../types";
import {
  connectionIsDisconnected,
  connectionStatusFor,
} from "../data/deviceStatus";
import { hasRoutingUpstream } from "../data/topologyChecks";
import {
  connectionPortLabel,
  portSummaryForDevice,
  portSummaryLabel,
} from "../data/portMap";
import "./Topology.css";

const iconFor = (type: string) => {
  const t = type.toLowerCase();
  if (t === "pos terminal") return CreditCard;
  if (t.includes("firewall")) return Shield;
  if (t.includes("wifi") || t.includes("wireless")) return Wifi;
  if (t.includes("router")) return Router;
  if (t.includes("outlet") || t.includes("data point")) return EthernetPort;
  if (t.includes("switch")) return Cable;
  if (t.includes("internet") || t.includes("vpn")) return Radio;
  if (t.includes("client")) return Users;
  if (t.includes("camera") || t.includes("video recorder")) return Video;
  if (t.includes("server")) return Server;
  return CircleHelp;
};
const lifecycleFor = (device: NetworkDevice): DeviceLifecycle =>
  device.lifecycle ??
  (device.status === "Retired"
    ? "Retired"
    : device.status === "Planned" || device.state === "Future"
      ? "Planned"
      : "Active");

type QuickAddData = NetworkDevice & {
  onQuickAdd: (id: string, side: "before" | "after") => void;
  routingWarning: boolean;
  portSummary?: string;
};

function DeviceNode({ data }: NodeProps<TopologyNode>) {
  const displayType =
    data.operatingMode === "Modem / bridge only"
      ? "DSL modem / bridge"
      : data.operatingMode === "Access point only"
        ? "Wireless access point"
        : data.operatingMode === "Router + wireless access point"
          ? "Router / wireless access point"
          : data.deviceType;
  const Icon = iconFor(displayType);
  const description = [
    data.deviceType === "Internet service"
      ? [data.serviceProvider, data.serviceType].filter(Boolean).join(" — ")
      : data.quantity
        ? `${data.quantity} ${data.quantity === 1 ? "camera" : "cameras"}`
        : "",
    data.deviceType === "Internet service" ? "" : data.manufacturer,
    data.deviceType === "Internet service" ? "" : data.model,
  ]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const quickAdd = (data as QuickAddData).onQuickAdd;
  const routingWarning = (data as QuickAddData).routingWarning;
  const portSummary = (data as QuickAddData).portSummary;
  const lifecycle = lifecycleFor(data);
  const statusLabel =
    data.status === "Needs Verification" ? "Verify" : data.status;
  const stateLabel =
    lifecycle.toLowerCase() === statusLabel.toLowerCase()
      ? lifecycle
      : `${lifecycle} · ${statusLabel}`;
  const pointerStart = useRef({ x: 0, y: 0 });
  const clickHandle = (event: ReactMouseEvent, side: "before" | "after") => {
    event.stopPropagation();
    const moved = Math.hypot(
      event.clientX - pointerStart.current.x,
      event.clientY - pointerStart.current.y,
    );
    if (moved <= 4) quickAdd(data.id, side);
  };
  const rememberPointer = (event: PointerEvent) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  return (
    <div
      className={`network-node ${description ? "" : "node-compact"} status-${data.status.toLowerCase().replace(" ", "-")} state-${data.state.toLowerCase()} lifecycle-${lifecycle.toLowerCase()}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        aria-label={`Add a device before ${data.hostname}, or drag to connect`}
        title="Click to add an attached device · drag to connect"
        onPointerDown={rememberPointer}
        onClick={(event) => clickHandle(event, "before")}
      />
      <div className="node-top">
        <div className="node-heading">
          <span className="node-icon">
            <Icon size={14} />
          </span>
          <div>
            <strong>{data.hostname}</strong>
            <div className="node-type">{displayType}</div>
          </div>
        </div>
      </div>
      {description && <div className="node-meta">{description}</div>}
      {portSummary && <div className="node-port-summary">{portSummary}</div>}
      {routingWarning && (
        <div className="node-routing-warning">
          <AlertTriangle size={11} /> Check routing setup
        </div>
      )}
      <div className="node-footer">
        <span className="node-status">{stateLabel}</span>
        <span>
          {data.managementIp || data.connectionType || "Details required"}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        aria-label={`Add a device after ${data.hostname}, or drag to connect`}
        title="Click to add an attached device · drag to connect"
        onPointerDown={rememberPointer}
        onClick={(event) => clickHandle(event, "after")}
      />
    </div>
  );
}

const nodeTypes = { networkDevice: DeviceNode, remoteOffice: RemoteOfficeNode };
function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<TopologyEdge>) {
  const [showActions, setShowActions] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowActions(true);
  };
  const hide = () => {
    hideTimer.current = setTimeout(() => setShowActions(false), 120);
  };
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        className="edge-hover-target"
        onMouseEnter={show}
        onMouseLeave={hide}
      />
      {showActions && (
        <EdgeLabelRenderer>
          <div
            className="edge-overlay"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {showActions && (
              <button
                className="edge-delete"
                title="Remove connection"
                aria-label="Remove connection"
                onClick={(event) => {
                  event.stopPropagation();
                  const edgeData = data as NetworkConnection & {
                    onDelete?: (connectionId: string) => void;
                  };
                  edgeData?.onDelete?.(id);
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { networkConnection: ConnectionEdge };

function RefreshConnectionHandles({ devices, relationships }: {
  devices: NetworkDevice[];
  relationships: SiteRelationship[];
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    // Node state is synchronised by the parent effect. Wait for that commit
    // before looking up DOM nodes, including newly inserted devices.
    const frame = requestAnimationFrame(() => {
      updateNodeInternals([
        ...devices.map((device) => device.id),
        ...relationships.map((relationship) => `__office_link__${relationship.id}`),
      ]);
    });
    return () => cancelAnimationFrame(frame);
  }, [devices, relationships, updateNodeInternals]);
  return null;
}
interface Props {
  onEditRelationship?: (id: string) => void;
  siteId: string;
  sites: Site[];
  relationships: SiteRelationship[];
  onOpenSite: (id: string) => void;
  cabinets: Cabinet[];
  allDevices: NetworkDevice[];
  showCabinets: boolean;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  onDeviceClick: (id: string) => void;
  onConnectionClick: (id: string) => void;
  onConnectionDelete: (id: string) => void;
  onMoveMany: (
    positions: { id: string; position: { x: number; y: number } }[],
  ) => void;
  onDragStateChange: (dragging: boolean) => void;
  onConnect: (connection: Connection) => void;
  onQuickAdd: (id: string, side: "before" | "after") => void;
  onAddAt: (position: { x: number; y: number }) => void;
  onCleanUp: () => void;
}
export function Topology({
  siteId,
  sites,
  relationships,
  onOpenSite,
  onEditRelationship,
  cabinets,
  allDevices,
  showCabinets,
  devices,
  connections,
  onDeviceClick,
  onConnectionClick,
  onConnectionDelete,
  onMoveMany,
  onDragStateChange,
  onConnect,
  onQuickAdd,
  onAddAt,
  onCleanUp,
}: Props) {
  const draggingRef = useRef(false);
  const changeDragState = (dragging: boolean) => {
    draggingRef.current = dragging;
    onDragStateChange(dragging);
  };
  const remoteLinks = relationships.filter(
    (r) =>
      r.status !== "Removed" &&
      (r.sourceSiteId === siteId || r.targetSiteId === siteId),
  );
  const remoteId = (r: SiteRelationship) => `__office_link__${r.id}`;
  const remoteNodes: TopologyNode[] = remoteLinks.map((r, i) => {
    const otherId = r.sourceSiteId === siteId ? r.targetSiteId : r.sourceSiteId;
    return {
      id: remoteId(r),
      type: "remoteOffice",
      draggable: false,
      selectable: false,
      connectable: false,
      position: {
        x: Math.max(0, ...devices.map((d) => d.position.x)) + 384,
        y: Math.min(0, ...devices.map((d) => d.position.y)) + i * 192,
      },
      data: {
        id: remoteId(r),
        hostname:
          sites.find((s) => s.id === otherId)?.name ?? "Office unavailable",
        deviceType: "Remote office",
        manufacturer: "",
        model: r.technology,
        notes: r.tunnel?.routing ?? "Endpoints not documented",
        state: r.state,
        status: r.status,
        physicalLocation: "",
        connectionType: "VPN",
        managementIp: "",
        subnetVlan: "",
        macAddress: "",
        serialNumber: "",
        switchPort: "",
        lastVerified: "",
        position: { x: 0, y: 0 },
      },
    };
  });
  const incomingNodes: TopologyNode[] = devices.map((d) => ({
    id: d.id,
    type: "networkDevice",
    position: d.position,
    data: {
      ...d,
      onQuickAdd,
      routingWarning: hasRoutingUpstream(d.id, devices, connections),
      portSummary: (() => {
        const summary = portSummaryForDevice(d, devices, connections);
        return summary ? portSummaryLabel(summary) : undefined;
      })(),
    } as NetworkDevice,
  }));
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([
    ...incomingNodes,
    ...remoteNodes,
  ]);
  const [instance, setInstance] = useState<ReactFlowInstance<
      TopologyNode,
      TopologyEdge
    > | null>(null),
    [contextMenu, setContextMenu] = useState<{
      left: number;
      top: number;
      position: { x: number; y: number };
    } | null>(null);
  useEffect(() => {
    // React Flow owns live positions until drop. Parent renders (including
    // save-status updates) must not replace them with persisted positions.
    if (draggingRef.current) return;
    setNodes((current) =>
      [...incomingNodes, ...remoteNodes].map((incoming) => {
        const existing = current.find((node) => node.id === incoming.id);
        return existing
          ? {
              ...incoming,
              // React Flow hides nodes without measurements. Keep these across
              // parent renders; ResizeObserver updates them when content changes.
              measured: existing.measured,
              selected: existing.selected,
              dragging: existing.dragging,
            }
          : incoming;
      }),
    );
  }, [devices, relationships, siteId, sites, setNodes]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [contextMenu]);
  const edges: TopologyEdge[] = connections.map((c) => {
    const source = devices.find((device) => device.id === c.source),
      target = devices.find((device) => device.id === c.target),
      status = connectionStatusFor(source, target, c.status),
      disconnected = connectionIsDisconnected(source, target);
    return {
      id: c.id,
      source: c.source,
      target: c.target,
      type: "networkConnection",
      data: {
        ...c,
        label: connectionPortLabel(c, devices, connections),
        status,
        onDelete: onConnectionDelete,
      },
      animated: c.state === "Future" || status === "Planned" || disconnected,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `edge-${c.state.toLowerCase()} edge-${status.toLowerCase().replace(" ", "-")}${disconnected ? " edge-disconnected" : ""}`,
      style: {
        stroke: disconnected
          ? "#9a9ca3"
          : status === "Known"
            ? "#34d399"
            : status === "Needs Verification"
              ? "#fbbf24"
              : status === "Compromised" || status === "Removed"
                ? "#f87171"
                : "#3d75ed",
      },
    };
  });
  const connectEnd: OnConnectEnd = (event, connectionState) => {
    if (connectionState.toHandle || !connectionState.fromNode) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!point) return;
    const targetElement = document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest<HTMLElement>(".react-flow__node"),
      targetNodeId = targetElement?.dataset.id,
      sourceNodeId = connectionState.fromNode.id;
    if (
      !targetNodeId ||
      targetNodeId === sourceNodeId ||
      !devices.some((d) => d.id === targetNodeId) ||
      !devices.some((d) => d.id === sourceNodeId)
    )
      return;
    const startedFromTarget = connectionState.fromHandle?.type === "target";
    onConnect({
      source: startedFromTarget ? targetNodeId : sourceNodeId,
      target: startedFromTarget ? sourceNodeId : targetNodeId,
      sourceHandle: null,
      targetHandle: null,
    });
  };
  return (
    <div className="topology-canvas">
      <ReactFlow<TopologyNode, TopologyEdge>
        nodes={nodes}
        edges={[
          ...edges,
          ...remoteLinks.flatMap((r) => {
            const gateway =
              r.sourceSiteId === siteId
                ? r.tunnel?.sourceGatewayId
                : r.tunnel?.targetGatewayId;
            return gateway && devices.some((d) => d.id === gateway)
              ? [
                  {
                    id: remoteId(r),
                    source: gateway,
                    target: remoteId(r),
                    type: "default",
                    animated: r.state === "Future",
                    style: { stroke: "#92a9d4", strokeDasharray: "6 5" },
                    deletable: false,
                    selectable: false,
                  },
                ]
              : [];
          }),
        ]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.5 }}
        minZoom={0.5}
        maxZoom={1.8}
        snapToGrid={false}
        snapGrid={TOPOLOGY_GRID}
        nodesConnectable
        selectionMode={SelectionMode.Partial}
        selectionKeyCode="Shift"
        panOnDrag
        onConnect={onConnect}
        onConnectEnd={connectEnd}
        onInit={setInstance}
        onPaneClick={() => setContextMenu(null)}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          if (!instance) return;
          const bounds = (
            event.currentTarget as HTMLElement
          ).getBoundingClientRect();
          setContextMenu({
            left: Math.min(event.clientX - bounds.left, bounds.width - 180),
            top: Math.min(event.clientY - bounds.top, bounds.height - 88),
            position: snapTopologyPosition(
              instance.screenToFlowPosition(
                {
                  x: event.clientX,
                  y: event.clientY,
                },
                { snapToGrid: false },
              ),
            ),
          });
        }}
        onNodeClick={(_, n) => {
          const link = remoteLinks.find((r) => remoteId(r) === n.id);
          if (link)
            onOpenSite(
              link.sourceSiteId === siteId
                ? link.targetSiteId
                : link.sourceSiteId,
            );
          else onDeviceClick(n.id);
        }}
        onEdgeClick={(_, e) => {
          const link = remoteLinks.find((r) => remoteId(r) === e.id);
          if (link) onEditRelationship?.(link.id);
          else onConnectionClick(e.id);
        }}
        onNodeDragStart={() => changeDragState(true)}
        onNodeDragStop={(_, node, draggedNodes) => {
          onMoveMany(
            (draggedNodes.length ? draggedNodes : [node]).map((item) => ({
              id: item.id,
              position: snapTopologyPosition(item.position),
            })),
          );
          changeDragState(false);
        }}
        colorMode="dark"
      >
        <RefreshConnectionHandles devices={devices} relationships={relationships} />
        {showCabinets && (
          <CabinetGroups
            cabinets={cabinets}
            nodes={nodes}
            allDevices={allDevices}
            onPreview={(moves) => {
              const positions = new Map(moves.map((m) => [m.id, m.position]));
              setNodes((current) =>
                current.map((n) =>
                  positions.has(n.id)
                    ? { ...n, position: positions.get(n.id)! }
                    : n,
                ),
              );
            }}
            onCommit={onMoveMany}
            onDragStateChange={changeDragState}
          />
        )}
        <Background color="#24271f" gap={TOPOLOGY_GRID[0]} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const status = (n.data as NetworkDevice).status;
            if (status === "Known") return "#34d399";
            if (status === "Needs Verification") return "#fbbf24";
            if (status === "Compromised" || status === "Removed")
              return "#f87171";
            return "#3d75ed";
          }}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      {contextMenu && (
        <div
          className="canvas-context-menu"
          role="menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
        >
          <button
            role="menuitem"
            onClick={() => {
              onAddAt(contextMenu.position);
              setContextMenu(null);
            }}
          >
            <Plus size={15} /> Add device here
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onCleanUp();
              setContextMenu(null);
            }}
          >
            <WandSparkles size={15} /> Clean up layout
          </button>
        </div>
      )}
    </div>
  );
}
