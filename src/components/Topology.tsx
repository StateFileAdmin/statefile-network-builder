import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
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
  type Connection,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import {
  Cable,
  CircleHelp,
  EthernetPort,
  Radio,
  Router,
  Server,
  Shield,
  Users,
  Wifi,
  Plus,
} from "lucide-react";
import type {
  NetworkConnection,
  NetworkDevice,
  TopologyEdge,
  TopologyNode,
} from "../types";
import "./Topology.css";

const iconFor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("firewall")) return Shield;
  if (t.includes("wifi") || t.includes("wireless")) return Wifi;
  if (t.includes("router")) return Router;
  if (t.includes("outlet") || t.includes("data point")) return EthernetPort;
  if (t.includes("switch")) return Cable;
  if (t.includes("internet") || t.includes("vpn")) return Radio;
  if (t.includes("client")) return Users;
  if (t.includes("server")) return Server;
  return CircleHelp;
};

type QuickAddData = NetworkDevice & {
  onQuickAdd: (id: string, side: "before" | "after") => void;
};

function DeviceNode({ data }: NodeProps<TopologyNode>) {
  const Icon = iconFor(data.deviceType);
  const description = [data.manufacturer, data.model]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  const quickAdd = (data as QuickAddData).onQuickAdd;
  const pointerStart = useRef({ x: 0, y: 0 });
  const clickHandle = (event: MouseEvent, side: "before" | "after") => {
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
      className={`network-node ${description ? "" : "node-compact"} status-${data.status.toLowerCase().replace(" ", "-")} state-${data.state.toLowerCase()}`}
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
            <div className="node-type">{data.deviceType}</div>
          </div>
        </div>
      </div>
      {description && <div className="node-meta">{description}</div>}
      <div className="node-footer">
        <span className="node-status">
          {data.state === "Future" ? "Future · " : ""}
          {data.status}
        </span>
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

const nodeTypes = { networkDevice: DeviceNode };
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
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label edge-label-${data.state.toLowerCase()}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { networkConnection: ConnectionEdge };
interface Props {
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  onDeviceClick: (id: string) => void;
  onConnectionClick: (id: string) => void;
  onMoveMany: (
    positions: { id: string; position: { x: number; y: number } }[],
  ) => void;
  onConnect: (connection: Connection) => void;
  onQuickAdd: (id: string, side: "before" | "after") => void;
  onAddAt: (position: { x: number; y: number }) => void;
}
export function Topology({
  devices,
  connections,
  onDeviceClick,
  onConnectionClick,
  onMoveMany,
  onConnect,
  onQuickAdd,
  onAddAt,
}: Props) {
  const incomingNodes: TopologyNode[] = devices.map((d) => ({
    id: d.id,
    type: "networkDevice",
    position: d.position,
    data: { ...d, onQuickAdd } as NetworkDevice,
  }));
  const [nodes, setNodes, onNodesChange] =
    useNodesState<TopologyNode>(incomingNodes);
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
    setNodes((current) =>
      incomingNodes.map((incoming) => {
        const existing = current.find((node) => node.id === incoming.id);
        return existing
          ? { ...incoming, position: existing.position }
          : incoming;
      }),
    );
  }, [devices, setNodes]);
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
      status =
        source?.status === "Known" && target?.status === "Known"
          ? "Known"
          : c.status;
    return {
      id: c.id,
      source: c.source,
      target: c.target,
      type: "networkConnection",
      data: { ...c, status },
      animated: c.state === "Future",
      markerEnd: { type: MarkerType.ArrowClosed },
      className: `edge-${c.state.toLowerCase()} edge-${status.toLowerCase().replace(" ", "-")}`,
      style: {
        stroke:
          status === "Known"
            ? "#34d399"
            : status === "Needs Verification"
              ? "#fbbf24"
              : status === "Compromised" || status === "Removed"
                ? "#f87171"
                : "#3d75ed",
      },
    };
  });
  return (
    <div className="topology-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.5 }}
        minZoom={0.5}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[24, 24]}
        nodesConnectable
        selectionMode={SelectionMode.Partial}
        selectionKeyCode="Shift"
        panOnDrag
        onConnect={onConnect}
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
            top: Math.min(event.clientY - bounds.top, bounds.height - 48),
            position: instance.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
          });
        }}
        onNodeClick={(_, n) => onDeviceClick(n.id)}
        onEdgeClick={(_, e) => onConnectionClick(e.id)}
        onNodeDragStop={(_, node, draggedNodes) =>
          onMoveMany(
            (draggedNodes.length ? draggedNodes : [node]).map((item) => ({
              id: item.id,
              position: item.position,
            })),
          )
        }
        colorMode="dark"
      >
        <Background color="#24271f" gap={24} />
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
        </div>
      )}
    </div>
  );
}
