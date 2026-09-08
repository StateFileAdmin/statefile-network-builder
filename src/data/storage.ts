import { seedRegister } from "./seed";
import type { NetworkRegister } from "../types";
import {
  isNetworkRegister,
  MAX_REGISTER_BYTES,
  registerByteLength,
} from "./validation";
export const isCloudMode = import.meta.env.VITE_DEPLOYMENT_MODE === "cloud";
const REGISTER_KEY = "network-builder-register-v2",
  PUBLICATIONS_KEY = "network-builder-publications-v1";
export interface LoadedRegister {
  register: NetworkRegister;
  version: number;
  updatedAt?: string;
  updatedBy?: string | null;
}
export interface RegisterRepository {
  load(): Promise<LoadedRegister>;
  save(
    register: NetworkRegister,
    version: number,
  ): Promise<{ version: number; updatedAt?: string }>;
  session(): Promise<{
    email: string;
    displayName: string;
    role: "admin" | "staff";
    scopeAll: boolean;
    siteIds: string[];
    csrfToken: string;
  }>;
}
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired.");
    this.name = "SessionExpiredError";
  }
}
export class ConflictError extends Error {
  constructor(
    public latest: LoadedRegister,
    message: string,
  ) {
    super(message);
    this.name = "ConflictError";
  }
}
let csrfToken = "";
export const setCsrfToken = (value: string) => {
  csrfToken = value;
};
const apiRequest = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.method && init.method !== "GET" && csrfToken
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 || response.redirected)
    throw new SessionExpiredError();
  return response;
};
interface LocalPublication {
  id: number;
  site_id: string;
  register_version: number;
  release_note: string;
  published_at: string;
  published_by: string;
  site_version?: number;
}
const localPublications = () => {
  try {
    return JSON.parse(
      localStorage.getItem(PUBLICATIONS_KEY) || "[]",
    ) as LocalPublication[];
  } catch {
    return [];
  }
};
const localRequest = async (path: string, init?: RequestInit) => {
  const url = new URL(path, location.origin);
  if (
    url.pathname === "/api/publications" &&
    (!init?.method || init.method === "GET")
  ) {
    const siteId = url.searchParams.get("siteId");
    return Response.json({
      publications: localPublications()
        .filter((item) => item.site_id === siteId)
        .sort((a, b) => a.id - b.id)
        .map((item, index) => ({ ...item, site_version: index + 1 }))
        .reverse(),
    });
  }
  if (url.pathname === "/api/publications" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as {
        siteId: string;
        version: number;
        releaseNote: string;
      },
      siteVersion =
        localPublications().filter((item) => item.site_id === body.siteId)
          .length + 1,
      item: LocalPublication = {
        id: Date.now(),
        site_id: body.siteId,
        register_version: body.version,
        release_note: body.releaseNote,
        published_at: new Date().toISOString(),
        published_by: "Local user",
        site_version: siteVersion,
      };
    localStorage.setItem(
      PUBLICATIONS_KEY,
      JSON.stringify([...localPublications(), item]),
    );
    return Response.json({
      id: item.id,
      publishedVersion: item.register_version,
      siteVersion,
      publishedAt: item.published_at,
    });
  }
  return Response.json(
    { error: "This feature requires Cloudflare mode." },
    { status: 404 },
  );
};
export const authenticatedFetch = (path: string, init?: RequestInit) =>
  isCloudMode ? apiRequest(path, init) : localRequest(path, init);
class ApiRepository implements RegisterRepository {
  async load() {
    const response = await apiRequest("/api/register");
    if (!response.ok) throw new Error("Could not load the register.");
    return response.json() as Promise<LoadedRegister>;
  }
  async save(register: NetworkRegister, version: number) {
    const response = await apiRequest("/api/register", {
      method: "PUT",
      body: JSON.stringify({ register, version }),
    });
    if (response.status === 409) {
      const body = (await response.json()) as {
        message: string;
        register: NetworkRegister;
        version: number;
      };
      throw new ConflictError(
        { register: body.register, version: body.version },
        body.message,
      );
    }
    if (!response.ok) throw new Error("Could not save the register.");
    return response.json() as Promise<{ version: number; updatedAt?: string }>;
  }
  async session() {
    const response = await apiRequest("/api/session");
    if (!response.ok) throw new Error("Could not read the session.");
    const session = (await response.json()) as {
      email: string;
      displayName: string;
      role: "admin" | "staff";
      scopeAll: boolean;
      siteIds: string[];
      csrfToken: string;
    };
    setCsrfToken(session.csrfToken);
    return session;
  }
}
class LocalRepository implements RegisterRepository {
  async load() {
    try {
      const stored = JSON.parse(
        localStorage.getItem(REGISTER_KEY) || "null",
      ) as LoadedRegister | null;
      if (stored && isNetworkRegister(stored.register)) return stored;
    } catch {
      localStorage.removeItem(REGISTER_KEY);
    }
    const initial = {
      register: seedRegister,
      version: 1,
      updatedAt: seedRegister.updatedAt,
      updatedBy: "Local user",
    };
    localStorage.setItem(REGISTER_KEY, JSON.stringify(initial));
    return initial;
  }
  async save(register: NetworkRegister, version: number) {
    const next = {
      register,
      version: version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: "Local user",
    };
    localStorage.setItem(REGISTER_KEY, JSON.stringify(next));
    return { version: next.version, updatedAt: next.updatedAt };
  }
  async session() {
    return {
      email: "Local user",
      displayName: "Local user",
      role: "admin" as const,
      scopeAll: true,
      siteIds: [],
      csrfToken: "",
    };
  }
}
export const registerRepository: RegisterRepository = isCloudMode
  ? new ApiRepository()
  : new LocalRepository();
export function clearLegacyLocalData() {
  if (isCloudMode)
    try {
      localStorage.removeItem("network-builder-register-v1");
    } catch {}
}
export interface NetworkRegisterPackage {
  format: "network-register-package";
  exportVersion: 1;
  application: { name: string; version: string };
  exportedAt: string;
  profile: {
    type: "full-register";
    organisation: string;
    siteCount: number;
    includesTopologyLayout: true;
    includesOperationalData: true;
  };
  register: NetworkRegister;
}
export function createExportPackage(
  register: NetworkRegister,
  applicationName = "Network Builder",
): NetworkRegisterPackage {
  return {
    format: "network-register-package",
    exportVersion: 1,
    application: { name: applicationName, version: "1.0.0" },
    exportedAt: new Date().toISOString(),
    profile: {
      type: "full-register",
      organisation: register.organisation,
      siteCount: register.sites.length,
      includesTopologyLayout: true,
      includesOperationalData: true,
    },
    register,
  };
}
export function validateImport(value: unknown): NetworkRegister {
  if (!value || typeof value !== "object")
    throw new Error("The selected file is not a network register package.");
  const candidate = value as Partial<NetworkRegisterPackage> &
      Partial<NetworkRegister>,
    register =
      candidate.format === "network-register-package"
        ? candidate.register
        : candidate;
  if (!isNetworkRegister(register))
    throw new Error("Unsupported or invalid network register package.");
  if (registerByteLength(register) > MAX_REGISTER_BYTES)
    throw new Error("This register is too large to import safely.");
  return register;
}
