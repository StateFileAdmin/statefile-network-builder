const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/worker.ts'),'utf8');let user={role:'admin'},csrf=true,writes=0,changes=1;
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name)=>name==='./auth'?{handleAuth:async()=>null,sessionUser:async()=>user,requireCsrf:()=>csrf}:name==='./admin'?{handleAdmin:async()=>null}:{},URL,Response,Request,TextEncoder,console});
 const env={DB:{prepare(sql){return {bind(...args){assert.match(sql,/UPDATE register_publication/);assert.deepEqual(args,[2,'default']);return this;},async run(){writes++;return {meta:{changes}};}};}}};
 const request=()=>new Request('https://app.example/api/publications/2',{method:'DELETE'});
 user=null;assert.equal((await exports.default.fetch(request(),env)).status,401);
 user={role:'staff'};assert.equal((await exports.default.fetch(request(),env)).status,403);
 user={role:'admin'};csrf=false;assert.equal((await exports.default.fetch(request(),env)).status,403);assert.equal(writes,0);
 csrf=true;assert.equal((await exports.default.fetch(request(),env)).status,200);assert.equal(writes,1);
 changes=0;assert.equal((await exports.default.fetch(request(),env)).status,404);
 console.log('PASS: unauthenticated, staff, CSRF, authorised deletion and missing-entry behaviour');
})().catch(e=>{console.error(e);process.exitCode=1});
