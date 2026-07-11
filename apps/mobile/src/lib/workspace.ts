/**
 * Workspace-scoped fetch — mobile equivalent of apps/web/src/lib/workspace/client.ts.
 * Same contract: x-workspace-id header on every call. Adds the Supabase access
 * token as a Bearer header (mobile has no session cookie).
 */
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://www.leadash.com";
const WS_KEY   = "ld_ws";

let _workspaceId: string | null = null;

export async function setWorkspaceId(id: string) {
  _workspaceId = id;
  await SecureStore.setItemAsync(WS_KEY, id);
}

export async function getWorkspaceId(): Promise<string | null> {
  if (_workspaceId) return _workspaceId;
  _workspaceId = await SecureStore.getItemAsync(WS_KEY);
  return _workspaceId;
}

export async function clearWorkspaceId() {
  _workspaceId = null;
  await SecureStore.deleteItemAsync(WS_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(requireWorkspace = true): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError("Not signed in", 401);

  const headers: Record<string, string> = {
    Authorization:  `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };

  if (requireWorkspace) {
    const wsId = await getWorkspaceId();
    if (!wsId) throw new ApiError("No workspace selected", 400);
    headers["x-workspace-id"] = wsId;
  }

  return headers;
}

export async function wsFetch<T = unknown>(path: string, init?: RequestInit & { skipWorkspace?: boolean }): Promise<T> {
  const headers = await authHeaders(!init?.skipWorkspace);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const wsGet    = <T = unknown>(path: string) => wsFetch<T>(path);
export const wsPost   = <T = unknown>(path: string, data?: unknown) =>
  wsFetch<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
export const wsPatch  = <T = unknown>(path: string, data: unknown) =>
  wsFetch<T>(path, { method: "PATCH", body: JSON.stringify(data) });
export const wsDelete = <T = unknown>(path: string, data?: unknown) =>
  wsFetch<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined });
