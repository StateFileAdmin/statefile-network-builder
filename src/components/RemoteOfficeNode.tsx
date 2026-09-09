import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TopologyNode } from "../types";
export function RemoteOfficeNode({ data }: NodeProps<TopologyNode>) {
  return (
    <div className="network-node remote-office-node">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="eyebrow">Linked office · {data.state}</span>
      <strong>{data.hostname}</strong>
      <span>{data.model}</span>
      <small>{data.notes}</small>
      <span className="remote-office-action">Open office →</span>
    </div>
  );
}
