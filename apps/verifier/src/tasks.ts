/**
 * In-memory task store for bulk verification jobs.
 * Response format mirrors Reoon's bulk-task poll API so the worker
 * can use both providers with the same polling logic.
 */

import { randomUUID } from "crypto";
import { verifyBulk, type BulkResultMap } from "./bulk.js";

export interface TaskResponse {
  status:              "waiting" | "running" | "completed";
  count_total:         number;
  count_checked:       number;
  progress_percentage: number;
  results?:            BulkResultMap;
}

interface Task {
  status:      "waiting" | "running" | "completed";
  count_total: number;
  count_checked: number;
  results:     BulkResultMap | null;
  created_at:  number;
}

const store = new Map<string, Task>();

// Prune tasks older than 2 hours every 15 min
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60_000;
  for (const [id, task] of store) {
    if (task.created_at < cutoff) store.delete(id);
  }
}, 15 * 60_000);

export function createTask(emails: string[]): string {
  const id = randomUUID();
  const task: Task = {
    status:       "waiting",
    count_total:  emails.length,
    count_checked: 0,
    results:      null,
    created_at:   Date.now(),
  };
  store.set(id, task);

  // Fire-and-forget — runs in the Node event loop background
  setImmediate(async () => {
    task.status = "running";
    try {
      const results = await verifyBulk(emails, n => { task.count_checked = n; });
      task.results      = results;
      task.count_checked = Object.keys(results).length;
      task.status       = "completed";
      console.log(`[task:${id}] completed — ${task.count_checked} emails`);
    } catch (err) {
      console.error(`[task:${id}] failed:`, err);
      // Fallback: mark everything unknown so the job doesn't hang
      const fallback: BulkResultMap = {};
      for (const e of emails) fallback[e] = { status: "unknown", overall_score: 0 };
      task.results      = fallback;
      task.count_checked = emails.length;
      task.status       = "completed";
    }
  });

  return id;
}

export function getTaskResponse(id: string): TaskResponse | null {
  const task = store.get(id);
  if (!task) return null;
  const pct = task.count_total > 0
    ? Math.round((task.count_checked / task.count_total) * 100)
    : 0;
  return {
    status:              task.status,
    count_total:         task.count_total,
    count_checked:       task.count_checked,
    progress_percentage: pct,
    results:             task.status === "completed" ? task.results ?? undefined : undefined,
  };
}
