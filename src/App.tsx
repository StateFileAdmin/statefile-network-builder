import { useEffect, useRef, useState } from 'react'
import type { Connection } from '@xyflow/react'
import { AlertTriangle, Boxes, CircleDot, Download, FileJson, Map, Network, Plus, Printer, Upload } from 'lucide-react'
import { Topology } from './components/Topology'
import { Drawer } from './components/Drawer'
import { AssetRegister, IpPlan } from './components/Registers'
import { ManagementReport } from './components/Report'
import { DevicePalette, type DeviceTemplate } from './components/DevicePalette'
import { CustomSelect } from './components/FormControls'
import './components/SiteSelect.css'
import { ConflictError, SessionExpiredError, clearLegacyLocalData, createExportPackage, registerRepository, validateImport } from './data/storage'
import type { NetworkConnection, NetworkDevice, NetworkRegister, Site } from './types'
type View='topology'|'assets'|'ip-plan'|'report';type Selection={kind:'device'|'connection';id:string}|null
type SyncState='idle'|'saving'|'saved'|'error'
const SAVE_DEBOUNCE_MS=700
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`
const blankDevice=():NetworkDevice=>({id:uid('device'),hostname:'New device',deviceType:'Network device',manufacturer:'',model:'',managementIp:'',subnetVlan:'',macAddress:'',serialNumber:'',connectionType:'',physicalLocation:'',switchPort:'',notes:'',lastVerified:'',status:'Needs Verification',state:'Current',position:{x:300,y:250}})
export function App(){
 const [register,setRegister]=useState<NetworkRegister|null>(null),[siteId,setSiteId]=useState('west-perth'),[view,setView]=useState<View>('topology'),[selection,setSelection]=useState<Selection>(null),[notice,setNotice]=useState(''),[paletteOpen,setPaletteOpen]=useState(false);const importRef=useRef<HTMLInputElement>(null)
 const [loadError,setLoadError]=useState(''),[sync,setSync]=useState<SyncState>('idle'),[account,setAccount]=useState(''),[sessionEnds,setSessionEnds]=useState(0)
 // Version last read from the server; sent back on save so a stale write is rejected.
 const versionRef=useRef(0)
 // The register object the server holds, compared by reference so the save
 // effect can tell a real edit from simply adopting server state.
 const syncedRef=useRef<NetworkRegister|null>(null)

 const endSession=()=>{syncedRef.current=null;setRegister(null);window.location.reload()}

 const persist=async(next:NetworkRegister)=>{
  try{
   setSync('saving')
   const {version}=await registerRepository.save(next,versionRef.current)
   versionRef.current=version;syncedRef.current=next;setSync('saved')
  }catch(error){
   if(error instanceof SessionExpiredError)return endSession()
   if(error instanceof ConflictError){
    versionRef.current=error.latest.version;syncedRef.current=error.latest.register
    setRegister(error.latest.register);setSync('idle')
    window.alert(`${error.message} The register has been refreshed with their version — please re-apply your change.`)
    return
   }
   setSync('error');showNotice('Could not save to the server. Your change is not stored.')
  }
 }

 useEffect(()=>{void(async()=>{
  try{
   const [loaded,session]=await Promise.all([registerRepository.load(),registerRepository.session()])
   versionRef.current=loaded.version;syncedRef.current=loaded.register
   setRegister(loaded.register);setAccount(session.email);setSessionEnds(session.expiresAt)
   clearLegacyLocalData()
   if(!loaded.register.sites.some(s=>s.id===siteId))setSiteId(loaded.register.sites[0]?.id||'')
  }catch(error){
   if(error instanceof SessionExpiredError)return endSession()
   setLoadError(error instanceof Error?error.message:'Could not load the register.')
  }
 })()},[])

 useEffect(()=>{
  if(!register||register===syncedRef.current)return
  const timer=window.setTimeout(()=>{void persist(register)},SAVE_DEBOUNCE_MS)
  return ()=>window.clearTimeout(timer)
 },[register])

 useEffect(()=>{
  if(!sessionEnds)return
  const remaining=sessionEnds-Date.now()
  if(remaining<=0){endSession();return}
  const timer=window.setTimeout(endSession,remaining)
  return ()=>window.clearTimeout(timer)
 },[sessionEnds])
 if(loadError)return <div className="loading"><AlertTriangle/><span>{loadError}</span><button className="quiet" onClick={()=>window.location.reload()}>Retry</button></div>
 if(!register)return <div className="loading"><Network/><span>Loading network register…</span></div>
 const site=register.sites.find(s=>s.id===siteId)??register.sites[0];if(!site)return <div className="loading">No sites are configured.</div>
 const updateSite=(fn:(s:Site)=>Site)=>setRegister({...register,updatedAt:new Date().toISOString(),sites:register.sites.map(s=>s.id===site.id?fn(s):s)})
 const selectedDevice=selection?.kind==='device'?site.devices.find(d=>d.id===selection.id):undefined,selectedConnection=selection?.kind==='connection'?site.connections.find(c=>c.id===selection.id):undefined
 function showNotice(message:string){setNotice(message);window.setTimeout(()=>setNotice(''),2200)}
 const saveDevice=(device:NetworkDevice)=>{updateSite(s=>({...s,devices:s.devices.some(d=>d.id===device.id)?s.devices.map(d=>d.id===device.id?device:d):[...s.devices,device]}));setSelection({kind:'device',id:device.id});showNotice('Device saved')}
 const removeDevice=(id:string)=>{if(!window.confirm('Remove this device and all of its connections?'))return;updateSite(s=>({...s,devices:s.devices.filter(d=>d.id!==id),connections:s.connections.filter(c=>c.source!==id&&c.target!==id)}));setSelection(null);showNotice('Device removed')}
 const saveConnection=(connection:NetworkConnection)=>{updateSite(s=>({...s,connections:s.connections.some(c=>c.id===connection.id)?s.connections.map(c=>c.id===connection.id?connection:c):[...s.connections,connection]}));setSelection({kind:'connection',id:connection.id});showNotice('Connection saved')}
 const removeConnection=(id:string)=>{if(!window.confirm('Remove this connection?'))return;updateSite(s=>({...s,connections:s.connections.filter(c=>c.id!==id)}));setSelection(null);showNotice('Connection removed')}
 const newDevice=(template?:DeviceTemplate)=>{const base=blankDevice(),d:NetworkDevice=template?{...base,hostname:template.name,deviceType:template.deviceType,connectionType:template.connectionType,notes:template.notes,state:template.state||'Current',status:template.status||'Needs Verification'}:base;saveDevice(d);setView('topology');setPaletteOpen(false)}
 const connect=(c:Connection)=>{if(!c.source||!c.target||c.source===c.target)return;saveConnection({id:uid('connection'),source:c.source,target:c.target,label:'New connection',connectionType:'Ethernet',status:'Needs Verification',state:'Current'})}
 const exportJson=()=>{const portablePackage=createExportPackage(register),url=URL.createObjectURL(new Blob([JSON.stringify(portablePackage,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`network-register-${new Date().toISOString().slice(0,10)}.network-register.json`;a.click();URL.revokeObjectURL(url);showNotice('Portable register package exported')}
 const importJson=async(file:File)=>{try{const next=validateImport(JSON.parse(await file.text()));setRegister(next);setSiteId(next.sites[0]?.id||'');setSelection(null);showNotice('Network register imported')}catch(e){window.alert(e instanceof Error?e.message:'Could not import the register.')}finally{if(importRef.current)importRef.current.value=''}}
 const generateReport=()=>{setSelection(null);setView('report');window.setTimeout(()=>window.print(),250)}
 const tabs:[View,string,typeof Map][]=[['topology','Topology',Map],['assets','Assets',Boxes],['ip-plan','IP plan',CircleDot],['report','Report',Printer]],unknown=site.devices.filter(d=>d.status==='Needs Verification').length+site.ipPlan.filter(i=>i.status==='Needs Verification').length
 return <div className="app-shell"><header className="app-header"><div className="brand"><span className="brand-mark"><Network size={20}/></span><div><b>Network Builder</b><small>Infrastructure source of truth</small></div></div><div className="header-actions"><span className={`sync-chip sync-${sync}`} title={account?`Signed in as ${account}`:undefined}>{sync==='saving'?'Saving…':sync==='error'?'Not saved':sync==='saved'?'Saved':account||'Shared register'}</span><button className="quiet" onClick={()=>importRef.current?.click()}><Upload size={16}/> Import</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={e=>e.target.files?.[0]&&void importJson(e.target.files[0])}/><button className="quiet" onClick={exportJson}><Download size={16}/> Export package</button><button className="primary" onClick={generateReport}><Printer size={16}/> Generate report</button></div></header>
 <div className="workspace-header"><div className="site-select-wrap"><span className="eyebrow">Active site</span><div className="site-custom-select"><CustomSelect label="Active site" value={site.id} options={register.sites.map(s=>({value:s.id,label:s.name,description:s.address||"Address not recorded"}))} onChange={value=>{setSiteId(value);setSelection(null)}}/></div><p>{site.address||'Address not yet recorded'}</p></div><div className="site-stats"><div><b>{site.devices.filter(d=>d.state==='Current'&&d.status!=='Retired').length}</b><span>Current assets</span></div><div className={unknown?'amber-stat':''}><b>{unknown}</b><span>Unverified items</span></div><div><b>{site.devices.filter(d=>d.state==='Future').length}</b><span>Planned assets</span></div></div></div>
 <nav className="view-tabs">{tabs.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>{setView(id);setSelection(null)}}><Icon size={16}/>{label}</button>)}<span className="tab-spacer"/>{view==='topology'&&<><span className="canvas-help">Drag to arrange · connect using node handles</span><button onClick={()=>setPaletteOpen(true)}><Plus size={16}/> Add device</button></>}</nav>
 <main className={`main-view view-${view}`}>{view==='topology'&&<div className="canvas-frame"><div className="state-legend"><span><i className="current"/>Current state</span><span><i className="future"/>Future / planned</span><span><i className="unknown"/>Needs verification</span></div>{site.devices.length?<Topology devices={site.devices} connections={site.connections} onDeviceClick={id=>setSelection({kind:'device',id})} onConnectionClick={id=>setSelection({kind:'connection',id})} onMove={(id,position)=>updateSite(s=>({...s,devices:s.devices.map(d=>d.id===id?{...d,position}:d)}))} onConnect={connect}/>:<div className="empty-state"><Network size={36}/><h2>No topology recorded</h2><p>Add the first device to begin documenting this site.</p><button className="primary" onClick={()=>setPaletteOpen(true)}><Plus size={16}/> Choose a component</button></div>}</div>}{view==='assets'&&<AssetRegister devices={site.devices} onEdit={id=>setSelection({kind:'device',id})} onAdd={()=>setPaletteOpen(true)}/>} {view==='ip-plan'&&<IpPlan entries={site.ipPlan} onChange={ipPlan=>updateSite(s=>({...s,ipPlan}))}/>} {view==='report'&&<><div className="report-toolbar no-print"><div><AlertTriangle size={16}/><span>Public WAN IPs are excluded by default. Use “Generate report” to print or save as PDF.</span></div><button className="primary" onClick={()=>window.print()}><Printer size={16}/> Print / save PDF</button></div><ManagementReport site={site}/></>}</main>
 {selectedDevice&&<Drawer kind="device" value={selectedDevice} onSave={saveDevice} onDelete={()=>removeDevice(selectedDevice.id)} onClose={()=>setSelection(null)}/>} {selectedConnection&&<Drawer kind="connection" value={selectedConnection} deviceNames={Object.fromEntries(site.devices.map(d=>[d.id,d.hostname]))} onSave={saveConnection} onDelete={()=>removeConnection(selectedConnection.id)} onClose={()=>setSelection(null)}/>} {paletteOpen&&<DevicePalette onAdd={newDevice} onClose={()=>setPaletteOpen(false)}/>} {notice&&<div className="toast"><FileJson size={16}/>{notice}</div>}</div>
}
