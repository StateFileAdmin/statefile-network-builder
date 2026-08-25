import { seedRegister } from './seed'
import type { NetworkRegister } from '../types'
export interface RegisterRepository { load():Promise<NetworkRegister>; save(register:NetworkRegister):Promise<void> }
const STORAGE_KEY = 'network-design-register-v1'
const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value)) as T
export class LocalStorageRepository implements RegisterRepository {
  async load(){ const raw=localStorage.getItem(STORAGE_KEY); if(!raw)return clone(seedRegister); try{const parsed=JSON.parse(raw) as NetworkRegister;if(parsed.schemaVersion!==1||!Array.isArray(parsed.sites))throw new Error();return parsed}catch{return clone(seedRegister)} }
  async save(register:NetworkRegister){localStorage.setItem(STORAGE_KEY,JSON.stringify(register))}
}
export const registerRepository:RegisterRepository=new LocalStorageRepository()
export interface NetworkRegisterPackage { format:'network-register-package';exportVersion:1;application:{name:string;version:string};exportedAt:string;profile:{type:'full-register';organisation:string;siteCount:number;includesTopologyLayout:true;includesOperationalData:true};register:NetworkRegister }
export function createExportPackage(register:NetworkRegister,applicationName='Network Design Register'):NetworkRegisterPackage{return {format:'network-register-package',exportVersion:1,application:{name:applicationName,version:'1.0.0'},exportedAt:new Date().toISOString(),profile:{type:'full-register',organisation:register.organisation,siteCount:register.sites.length,includesTopologyLayout:true,includesOperationalData:true},register}}
export function validateImport(value:unknown):NetworkRegister{if(!value||typeof value!=='object')throw new Error('The selected file is not a network register package.');const candidate=value as Partial<NetworkRegisterPackage>&Partial<NetworkRegister>;const register=candidate.format==='network-register-package'?candidate.register:candidate;if(!register||register.schemaVersion!==1||!Array.isArray(register.sites))throw new Error('Unsupported or invalid network register package.');return register as NetworkRegister}
