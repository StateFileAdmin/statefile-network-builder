const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'device-configuration-'));
try {
 for (const name of ['infrastructure','siteLinks','validation','physicalPorts','connectionTypes','portMap','deviceStatus']) {
  fs.writeFileSync(path.join(out,name+'.js'),ts.transpileModule(fs.readFileSync(path.join(root,'src/data',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 const {validSite}=require(path.join(out,'validation.js'));
 const {portSummaryForDevice,portSummaryLabel}=require(path.join(out,'portMap.js'));
 const device=(id)=>({id,hostname:id,deviceType:'Router / Gateway',manufacturer:'',model:'',managementIp:'',subnetVlan:'',macAddress:'',serialNumber:'',connectionType:'Ethernet',physicalLocation:'',switchPort:'',notes:'',lastVerified:'',status:'Known',state:'Current',position:{x:0,y:0}});
 const ports=[{id:'lan1',label:'LAN 1',role:'LAN',enabled:true,notes:'Desk'},{id:'wan',label:'WAN',role:'WAN/LAN',enabled:true,notes:''}];
 const gateway={...device('router'),physicalPorts:ports,firewall:{status:'Enabled',details:'Allow office LAN to WAN; block unsolicited inbound.',lastVerified:'2026-09-09'},vpn:{status:'Disabled',details:'No tunnels configured',lastVerified:''}};
 const edge={id:'c1',source:'router',target:'pc',sourcePortId:'lan1',label:'Desk cable',connectionType:'Ethernet',state:'Current',status:'Known'};
 const site={id:'office',name:'Office',address:'',description:'',devices:[gateway,device('pc'),device('other')],connections:[edge],ipPlan:[],risks:[],plannedImprovements:[]};
 const valid=(s)=>assert.equal(validSite(s),true);
 const invalid=(s)=>assert.equal(validSite(s),false);
 valid(site);const restored=JSON.parse(JSON.stringify(site));valid(restored);assert.deepEqual(restored,site);
 valid({...site,devices:site.devices.map(d=>{const {physicalPorts,firewall,vpn,...old}=d;return old;}),connections:[{...edge,sourcePortId:undefined}]});
 invalid({...site,connections:[edge,{...edge,id:'c2',target:'other'}]});
 valid({...site,connections:[edge,{...edge,id:'future',target:'other',state:'Future'}]});
 invalid({...site,connections:[{...edge,sourcePortId:'missing'}]});
 invalid({...site,connections:[{...edge,connectionType:'VPN / IPsec'}]});
 invalid({...site,connections:[{...edge,connectionType:'Wi-Fi'}]});
 valid({...site,connections:[{...edge,connectionType:'VPN / IPsec',sourcePortId:undefined}]});
 invalid({...site,devices:[{...gateway,physicalPorts:[ports[0],ports[0]]},...site.devices.slice(1)]});
 invalid({...site,devices:[{...gateway,physicalPorts:[{...ports[0],enabled:false},ports[1]]},...site.devices.slice(1)]});
 invalid({...site,devices:[{...gateway,firewall:{status:'Maybe',details:'',lastVerified:''}},...site.devices.slice(1)]});
 const summary=portSummaryForDevice(gateway,site.devices,site.connections);assert.equal(summary.connected.length,1);assert.equal(summary.available.length,1);
 const unassigned=portSummaryForDevice(gateway,site.devices,[{...edge,sourcePortId:undefined}]);assert.equal(unassigned.unassigned,1);assert.match(portSummaryLabel(unassigned),/need ports/);
 const virtual=portSummaryForDevice(gateway,site.devices,[{...edge,connectionType:'VPN',sourcePortId:undefined}]);assert.equal(virtual.connected.length,0);assert.equal(virtual.unassigned,0);
 console.log('PASS: saved settings, backwards compatibility, graph port validation, duplicate/disabled ports, future plans, VPN/Wi-Fi and unassigned links');
} finally {fs.rmSync(out,{recursive:true,force:true});}
