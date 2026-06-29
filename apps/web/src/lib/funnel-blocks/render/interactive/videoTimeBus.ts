type Listener = (t: number) => void;

const listeners = new Map<string, Set<Listener>>();
const lastTime = new Map<string, number>();

export function publishVideoTime(blockId: string, t: number): void {
  lastTime.set(blockId, t);
  listeners.get(blockId)?.forEach(fn => fn(t));
}

export function subscribeVideoTime(blockId: string, fn: Listener): () => void {
  if (!listeners.has(blockId)) listeners.set(blockId, new Set());
  listeners.get(blockId)!.add(fn);
  const last = lastTime.get(blockId);
  if (last != null) fn(last);
  return () => listeners.get(blockId)?.delete(fn);
}
