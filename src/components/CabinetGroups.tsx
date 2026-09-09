import { useRef } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import type { Cabinet, NetworkDevice, TopologyNode } from "../types";
import { snapTopologyPosition } from "../data/topologyGrid";
type Move = { id: string; position: { x: number; y: number } };
export function CabinetGroups({
  cabinets,
  nodes,
  allDevices,
  onPreview,
  onCommit,
  onDragStateChange,
}: {
  cabinets: Cabinet[];
  nodes: TopologyNode[];
  allDevices: NetworkDevice[];
  onPreview: (moves: Move[]) => void;
  onCommit: (moves: Move[]) => void;
  onDragStateChange: (v: boolean) => void;
}) {
  const flow = useReactFlow();
  const drag = useRef<{
    x: number;
    y: number;
    zoom: number;
    original: Move[];
    moves: Move[];
  } | null>(null);
  const cancel = () => {
    if (drag.current) onPreview(drag.current.original);
    drag.current = null;
    onDragStateChange(false);
  };
  return (
    <ViewportPortal>
      {cabinets.map((c) => {
        const members = nodes.filter((n) => n.data.cabinetId === c.id);
        if (!members.length) return null;
        const x = Math.min(...members.map((n) => n.position.x)) - 24,
          y = Math.min(...members.map((n) => n.position.y)) - 60;
        const right =
            Math.max(
              ...members.map((n) => n.position.x + (n.measured?.width ?? 250)),
            ) + 24,
          bottom =
            Math.max(
              ...members.map((n) => n.position.y + (n.measured?.height ?? 125)),
            ) + 24;
        return (
          <div
            key={c.id}
            className="cabinet-enclosure"
            style={{ left: x, top: y, width: right - x, height: bottom - y }}
          >
            <button
              className="cabinet-group-handle nodrag nopan"
              title="Drag to move all devices in this cabinet"
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
                const offsets: Record<string, { x: number; y: number }> = {
                  ArrowLeft: { x: -24, y: 0 },
                  ArrowRight: { x: 24, y: 0 },
                  ArrowUp: { x: 0, y: -24 },
                  ArrowDown: { x: 0, y: 24 },
                };
                const offset = offsets[e.key];
                if (offset && !drag.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  const moves = allDevices
                    .filter((d) => d.cabinetId === c.id)
                    .map((d) => ({
                      id: d.id,
                      position: {
                        x: d.position.x + offset.x,
                        y: d.position.y + offset.y,
                      },
                    }));
                  onPreview(moves);
                  onCommit(moves);
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const original = allDevices
                  .filter((d) => d.cabinetId === c.id)
                  .map((d) => ({ id: d.id, position: { ...d.position } }));
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  zoom: flow.getZoom(),
                  original,
                  moves: original,
                };
                onDragStateChange(true);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                e.stopPropagation();
                const delta = snapTopologyPosition({
                  x: (e.clientX - d.x) / d.zoom,
                  y: (e.clientY - d.y) / d.zoom,
                });
                d.moves = d.original.map((m) => ({
                  id: m.id,
                  position: {
                    x: m.position.x + delta.x,
                    y: m.position.y + delta.y,
                  },
                }));
                onPreview(d.moves);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (drag.current) {
                  const moves = drag.current.moves;
                  drag.current = null;
                  onCommit(moves);
                  onDragStateChange(false);
                }
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={cancel}
              onLostPointerCapture={() => {
                if (drag.current) cancel();
              }}
            >
              {c.room ? `${c.room} · ` : ""}
              {c.name}{" "}
              <span>
                {c.capacity}U · {members.length} devices
              </span>
            </button>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
