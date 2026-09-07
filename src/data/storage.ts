import type { NetworkRegister } from '../types'

/* The register lives in D1, reached through the Worker API. Nothing is
 * persisted in the browser: state is in memory only. */

export interface LoadedRegister { register:NetworkRegister; version:number; updatedAt?:string; updatedBy?:string|null }

export class SessionExpiredError extends Error { constructor(){ super('Your session has expired.'); this.name='SessionExpiredError' } }

export class ConflictError extends Error {
  constructor(public latest:LoadedRegister, message:string){ super(message); this.name='ConflictError' }
}

export interface RegisterRepository {
  load():Promise<LoadedRegister>
  save(register:NetworkRegister,version:number):Promise<{version:number;updatedAt?:string}>
  session():Promise<{email:string;expiresAt:number}>
}

const request = async (path:string,init?:RequestInit) => {
  const response = await fetch(path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers}})
  // Access redirects an expired session to its login page, and fetch follows it.
  if(response.status===401||response.redirected) throw new SessionExpiredError()
  return response
}

export class ApiRepository implements RegisterRepository {
  async load():Promise<LoadedRegister>{
    const response = await request('/api/register')
    if(!response.ok) throw new Error('Could not load the register from the server.')
    return await response.json() as LoadedRegister
  }
  async save(register:NetworkRegister,version:number){
    const response = await request('/api/register',{method:'PUT',body:JSON.stringify({register,version})})
    if(response.status===409){
      const body = await response.json() as {message:string;register:NetworkRegister;version:number}
      throw new ConflictError({register:body.register,version:body.version},body.message)
    }
    if(!response.ok) throw new Error('Could not save the register.')
    return await response.json() as {version:number;updatedAt?:string}
  }
  async session(){
    const response = await request('/api/session')
    if(!response.ok) throw new Error('Could not read the session.')
    return await response.json() as {email:string;expiresAt:number}
  }
}

export const registerRepository:RegisterRepository = new ApiRepository()

/** Clears data written by the pre-D1 localStorage version. Called only after a
 *  successful server load, so an outage never destroys a local copy. */
export function clearLegacyLocalData(){
  try{ localStorage.removeItem('network-builder-v1') }catch{ /* storage may be blocked */ }
}

export interface NetworkRegisterPackage { format:'network-register-package';exportVersion:1;application:{name:string;version:string};exportedAt:string;profile:{type:'full-register';organisation:string;siteCount:number;includesTopologyLayout:true;includesOperationalData:true};register:NetworkRegister }
export function createExportPackage(register:NetworkRegister,applicationName='Network Builder'):NetworkRegisterPackage{return {format:'network-register-package',exportVersion:1,application:{name:applicationName,version:'1.0.0'},exportedAt:new Date().toISOString(),profile:{type:'full-register',organisation:register.organisation,siteCount:register.sites.length,includesTopologyLayout:true,includesOperationalData:true},register}}
export function validateImport(value:unknown):NetworkRegister{if(!value||typeof value!=='object')throw new Error('The selected file is not a network register package.');const candidate=value as Partial<NetworkRegisterPackage>&Partial<NetworkRegister>;const register=candidate.format==='network-register-package'?candidate.register:candidate;if(!register||register.schemaVersion!==1||!Array.isArray(register.sites))throw new Error('Unsupported or invalid network register package.');return register as NetworkRegister}
