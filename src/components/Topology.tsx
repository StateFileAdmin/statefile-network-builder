import { useEffect } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useNodesState, type Connection, type NodeProps } from '@xyflow/react'
import { Cable, CircleHelp, Radio, Router, Server, Shield, Users, Wifi } from 'lucide-react'
import type { NetworkConnection, NetworkDevice, TopologyEdge, TopologyNode } from '../types'

const iconFor=(type:string)=>{const t=type.toLowerCase();if(t.includes('firewall'))return Shield;if(t.includes('wifi')||t.includes('wireless'))return Wifi;if(t.includes('router'))return Router;if(t.includes('switch'))return Cable;if(t.includes('internet')||t.includes('vpn'))return Radio;if(t.includes('client'))return Users;if(t.includes('server'))return Server;return CircleHelp}

function DeviceNode({data}:NodeProps<TopologyNode>){const Icon=iconFor(data.deviceType);return <div className={`network-node status-${data.status.toLowerCase().replace(' ','-')} state-${data.state.toLowerCase()}`}>
  <Handle type="target" position={Position.Left}/><div className="node-top"><span className="node-icon"><Icon size={16}/></span><span className={`status-dot ${data.status.toLowerCase().replace(' ','-')}`}/></div>
  <div className="node-type">{data.deviceType}</div><strong>{data.hostname}</strong><div className="node-meta">{data.manufacturer} {data.model}</div><div className="node-footer"><span>{data.state}</span><span>{data.managementIp||data.connectionType||'Details required'}</span></div><Handle type="source" position={Position.Right}/>
</div>}

const nodeTypes={networkDevice:DeviceNode}
interface Props{devices:NetworkDevice[];connections:NetworkConnection[];onDeviceClick:(id:string)=>void;onConnectionClick:(id:string)=>void;onMove:(id:string,position:{x:number;y:number})=>void;onConnect:(connection:Connection)=>void}
export function Topology({devices,connections,onDeviceClick,onConnectionClick,onMove,onConnect}:Props){
 const incomingNodes:TopologyNode[]=devices.map(d=>({id:d.id,type:'networkDevice',position:d.position,data:d}))
 const [nodes,setNodes,onNodesChange]=useNodesState<TopologyNode>(incomingNodes)
 useEffect(()=>{
   setNodes(current=>incomingNodes.map(incoming=>{
     const existing=current.find(node=>node.id===incoming.id)
     return existing?{...incoming,position:existing.position}:incoming
   }))
 },[devices,setNodes])
 const edges:TopologyEdge[]=connections.map(c=>({id:c.id,source:c.source,target:c.target,label:c.label,data:c,animated:c.state==='Future',markerEnd:{type:MarkerType.ArrowClosed},className:`edge-${c.state.toLowerCase()} edge-${c.status.toLowerCase().replace(' ','-')}`,style:{stroke:c.state==='Future'?'#8d83f6':c.status==='Needs Verification'?'#d99b36':'#4a7fab'}}))
 return <div className="topology-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} fitView fitViewOptions={{padding:.18}} minZoom={.3} maxZoom={1.8} snapToGrid snapGrid={[24,24]} nodesConnectable onConnect={onConnect} onNodeClick={(_,n)=>onDeviceClick(n.id)} onEdgeClick={(_,e)=>onConnectionClick(e.id)} onNodeDragStop={(_,n)=>onMove(n.id,n.position)} colorMode="dark">
   <Background color="#24344c" gap={24}/><MiniMap pannable zoomable nodeColor={n=>(n.data as NetworkDevice).state==='Future'?'#685cc7':'#28547d'}/><Controls showInteractive={false}/>
 </ReactFlow></div>
}
