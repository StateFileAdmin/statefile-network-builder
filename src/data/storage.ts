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
export function validateImport(value:unknown):NetworkRegister{if(!value||typeof value!=='object')throw new Error('The selected file is not a network register.');const c=value as Partial<NetworkRegister>;if(c.schemaVersion!==1||!Array.isArray(c.sites))throw new Error('Unsupported or invalid register schema.');return c as NetworkRegister}
