const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'device-categories-'));
try {
  for (const name of ['deviceTypes', 'deviceStatus', 'connectionTypes', 'topologyChecks']) {
    const source = fs.readFileSync(path.join(root, 'src/data', name + '.ts'), 'utf8');
    fs.writeFileSync(path.join(out, name + '.js'), ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText);
  }
  const {normaliseDeviceTypes} = require(path.join(out, 'deviceTypes.js'));
  const {usesPhysicalPort} = require(path.join(out, 'connectionTypes.js'));
  const {hasRoutingUpstream} = require(path.join(out, 'topologyChecks.js'));
  const kinds = ['Router', 'Router / security gateway', 'Firewall / NGFW', 'Router / WAP', 'Router / Wi-Fi', 'VPN service', 'Custom device'];
  const devices = kinds.map((deviceType, i) => ({id:'d'+i, hostname:'Device '+i, deviceType, manufacturer:'Example', model:'Model', managementIp:'10.0.0.'+i, notes:'Keep my notes', wirelessNetworks:'Office', position:{x:i*100,y:240}, state:'Current', status:'Known', ...(i===0?{operatingMode:'Access point only'}:{})}));
  const connections = devices.slice(1).map((d,i)=>({id:'e'+i,source:'d'+i,target:d.id,connectionType:'Ethernet',label:'Keep connection '+i,status:'Known',state:'Current',countsTowardPorts:false}));
  const register={schemaVersion:1,organisation:'Demo',updatedAt:'2026-09-09',sites:[{id:'site',name:'Site',devices,connections,ipPlan:[],risks:[],plannedImprovements:[]}],siteRelationships:[{id:'vpn',sourceSiteId:'site',targetSiteId:'branch',name:'Keep VPN'}]};
  const before=structuredClone(register);
  const next=normaliseDeviceTypes(register);
  assert.deepEqual(register,before,'Migration must not mutate the source');
  assert.deepEqual(next.sites[0].connections,before.sites[0].connections,'Every edge, endpoint and label stays intact');
  assert.deepEqual(next.siteRelationships,before.siteRelationships);
  assert.deepEqual(next.sites[0].devices.map(d=>d.deviceType),['Router / Gateway','Router / Gateway','Firewall','Router / Gateway','Router / Gateway','VPN service','Custom device']);
  for(let i=0;i<devices.length;i++){
    const {deviceType:a,operatingMode:b,...old}=devices[i];
    const {deviceType:c,operatingMode:d,...updated}=next.sites[0].devices[i];
    // The existing normaliser adds absent optional service fields as undefined.
    assert.equal(JSON.stringify(updated),JSON.stringify(old),'Retain all other device values');
  }
  assert.equal(next.sites[0].devices[0].operatingMode,'Access point only');
  assert.equal(next.sites[0].devices[3].operatingMode,'Router + wireless access point');
  assert.equal(next.sites[0].devices[4].operatingMode,'Router + wireless access point');
  assert.equal(normaliseDeviceTypes(next),next,'Repeated load must not trigger repeated saves');
  assert.deepEqual(normaliseDeviceTypes(JSON.parse(JSON.stringify(next))),JSON.parse(JSON.stringify(next)),'Export/import round trip');
  const routers=[{...devices[0],id:'a',operatingMode:'Router only',deviceType:'Router / Gateway'},{...devices[1],id:'b',deviceType:'Router / Gateway'}];
  const edge={...connections[0],source:'a',target:'b',countsTowardPorts:true};
  assert.equal(hasRoutingUpstream('b',routers,[edge]),true);
  for(const connectionType of ['VPN','VPN / IPsec','WireGuard','OpenVPN']){
    const vpn={...edge,connectionType};
    assert.equal(usesPhysicalPort(vpn),false);
    assert.equal(hasRoutingUpstream('b',routers,[vpn]),false);
  }
  assert.equal(usesPhysicalPort(edge),true);
  assert.equal(usesPhysicalPort({...edge,countsTowardPorts:false}),false);
  console.log('PASS: legacy categories, retained graph/data, idempotence, JSON round trip, VPN port/routing semantics');
} finally { fs.rmSync(out,{recursive:true,force:true}); }
