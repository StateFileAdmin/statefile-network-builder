const {chromium,expect}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:5210');
await page.evaluate(()=>{const d=(id,x)=>({id,hostname:id,deviceType:'Router / Gateway',manufacturer:'Demo',model:'Demo',managementIp:'',subnetVlan:'',macAddress:'',serialNumber:'',connectionType:'Ethernet',physicalLocation:'',switchPort:'',notes:'',lastVerified:'',status:'Known',state:'Current',position:{x,y:144}});const s=(id,devices)=>({id,name:id,address:'',description:'',devices,connections:[],ipPlan:[],risks:[],plannedImprovements:[]});const register={schemaVersion:1,organisation:'Fictional infrastructure test',updatedAt:'2026-09-09',sites:[{...s('Office A',[d('Gateway',48),d('Switch',384)]),connections:[{id:'c1',source:'Gateway',target:'Switch',label:'LAN',connectionType:'Ethernet',status:'Known',state:'Current'}]},s('Office B',[d('Remote gateway',48)])],siteRelationships:[{id:'vpn',sourceSiteId:'Office A',targetSiteId:'Office B',name:'Office VPN',technology:'WireGuard',notes:'',state:'Future',status:'Planned',tunnel:{sourceGatewayId:'Gateway',targetGatewayId:'Remote gateway',sourceSubnets:'192.168.1.0/24',targetSubnets:'192.168.2.0/24',routing:'Inter-office only',permittedTraffic:'Management'}}]};localStorage.setItem('network-builder-register-v2',JSON.stringify({register,version:1}));});
await page.reload();await page.locator('.location-card').filter({hasText:'Office A'}).click();

await expect(page.locator('.react-flow__node[data-id="Gateway"]')).toBeVisible();
await page.evaluate(()=>{window.hiddenFrames=[];window.watchNodes=true;function watch(){if(!window.watchNodes)return;const hidden=[...document.querySelectorAll('.react-flow__node')].filter(n=>getComputedStyle(n).visibility==='hidden').map(n=>n.dataset.id);if(hidden.length)window.hiddenFrames.push(hidden);requestAnimationFrame(watch)}requestAnimationFrame(watch)});
for(let i=0;i<8;i++){
 await page.getByRole('button',{name:'Cabinets',exact:true}).click();
 await page.keyboard.press('Escape');
 await page.waitForTimeout(80);
}
const hidden=await page.evaluate(()=>{window.watchNodes=false;return window.hiddenFrames});
console.log(JSON.stringify({hiddenFrames:hidden,errors}));
await browser.close();
expect(hidden).toEqual([]);expect(errors).toEqual([]);
