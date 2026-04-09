"use client";

let _workspaceId: string | null = null;

export function setWorkspaceId(id: string) {
  _workspaceId = id;
  if (typeof localStorage !== "undefined") localStorage.setItem("ld_ws", id);
}

export function getWorkspaceId(): string | null {
  if (_workspaceId) return _workspaceId;
  if (typeof localStorage !== "undefined") {
    _workspaceId = localStorage.getItem("ld_ws");
  }
  return _workspaceId;
}

/** Fetch with workspace header pre-filled. */
export async function wsFetch(path: string, init?: RequestInit): Promise<Response> {
  const wsId = getWorkspaceId();
  if (!wsId) throw new Error("No workspace selected");

  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      "x-workspace-id": wsId,
    },
  });
}

export async function wsGet<T>(path: string): Promise<T> {
  const r = await wsFetch(path);
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
  return r.json();
}

export async function wsPost<T>(path: string, body: unknown): Promise<T> {
  const r = await wsFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
  return r.json();
}

export async function wsPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await wsFetch(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
  return r.json();
}

export async function wsDelete(path: string, body?: unknown): Promise<void> {
  await wsFetch(path, { method: "DELETE", ...(body ? { body: JSON.stringify(body) } : {}) });
}
