import { wsFetch } from "@/lib/workspace/client";
import type {
  OutreachInboxSafe, OutreachList, OutreachCampaign, OutreachSequenceStep,
  ImportResult, CrmThread, OutreachTemplate, OutreachReply, OutreachCrmFilter,
  CampaignEnrollmentRow, CampaignAnalytics,
} from "@/types/outreach";

const base = "/api/outreach";

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
  return r.json();
}
const get  = <T>(p: string) => wsFetch(p).then(r => json<T>(r));
const post = <T>(p: string, b?: unknown) => wsFetch(p, { method: "POST", body: b != null ? JSON.stringify(b) : undefined }).then(r => json<T>(r));
const patch = <T>(p: string, b: unknown) => wsFetch(p, { method: "PATCH", body: JSON.stringify(b) }).then(r => json<T>(r));
const del  = (p: string, b?: unknown) => wsFetch(p, { method: "DELETE", body: b ? JSON.stringify(b) : undefined });

// ─── Inboxes ──────────────────────────────────────────────────────────────────
export const getInboxes       = ()                            => get<OutreachInboxSafe[]>(`${base}/inboxes`);
export const createSmtpInbox  = (d: Record<string, unknown>) => post<OutreachInboxSafe>(`${base}/inboxes`, d);
export const updateInbox      = (id: string, d: Record<string, unknown>) => patch<OutreachInboxSafe>(`${base}/inboxes/${id}`, d);
export const deleteInbox      = (id: string)                 => del(`${base}/inboxes/${id}`);

export async function importInboxes(rows: Record<string, string>[]): Promise<ImportResult> {
  return post(`${base}/inboxes/bulk`, { rows });
}

// ─── Lists ────────────────────────────────────────────────────────────────────
export const getLists    = ()                             => get<OutreachList[]>(`${base}/lists`);
export const createList  = (name: string, description?: string) => post<OutreachList>(`${base}/lists`, { name, description });
export const deleteList  = (id: string)                   => del(`${base}/lists/${id}`);

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function importLeads(rows: Record<string, string>[], listId: string, mapping: unknown[]): Promise<ImportResult> {
  // Build mapped rows from mapping
  const mapped = rows.map(row => {
    const out: Record<string, string> = {};
    for (const m of mapping as { csv_column: string; db_field: string }[]) {
      if (m.csv_column && m.db_field && row[m.csv_column] !== undefined) {
        out[m.db_field] = row[m.csv_column];
      }
    }
    return out;
  });
  return post<ImportResult>(`${base}/leads/import`, { list_id: listId, rows: mapped });
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const getCampaigns  = ()                                 => get<OutreachCampaign[]>(`${base}/campaigns`);
export const getCampaign   = (id: string)                       => get<OutreachCampaign>(`${base}/campaigns/${id}`);
export const createCampaign = (d: Partial<OutreachCampaign>)    => post<OutreachCampaign>(`${base}/campaigns`, d);
export const updateCampaign = (id: string, d: Partial<OutreachCampaign>) => patch<OutreachCampaign>(`${base}/campaigns/${id}`, d);
export const deleteCampaign = (id: string)                      => del(`${base}/campaigns/${id}`);

export const enrollLeads = (campaignId: string, listIds: string[]) =>
  post<{ enrolled: number }>(`${base}/campaigns/${campaignId}/enrollments`, { list_ids: listIds });

export const getCampaignEnrollments = (campaignId: string, page = 0, limit = 50, status = "all") =>
  get<{ enrollments: CampaignEnrollmentRow[]; total: number }>(
    `${base}/campaigns/${campaignId}/enrollments?page=${page}&limit=${limit}${status !== "all" ? `&status=${status}` : ""}`
  );

export const unenrollLead = (campaignId: string, enrollmentId: string) =>
  del(`${base}/campaigns/${campaignId}/enrollments/${enrollmentId}`);

export async function cloneCampaign(id: string): Promise<OutreachCampaign> {
  // Fetch, then create new with same data
  const c = await getCampaign(id);
  return createCampaign({ ...c, name: `${c.name} (copy)`, status: "draft", id: undefined, created_at: undefined, updated_at: undefined });
}

// ─── Sequences ────────────────────────────────────────────────────────────────
export const getSequence = (campaignId: string) =>
  get<OutreachSequenceStep[]>(`${base}/sequences?campaign_id=${campaignId}`);

export const saveSequence = (campaignId: string, steps: Partial<OutreachSequenceStep>[]) =>
  saveSequenceSteps(campaignId, steps);

export async function saveSequenceSteps(campaignId: string, steps: Partial<OutreachSequenceStep>[]): Promise<OutreachSequenceStep[]> {
  // Delete all existing and recreate
  const existing = await get<OutreachSequenceStep[]>(`${base}/sequences?campaign_id=${campaignId}`).catch(() => []);
  await Promise.all(existing.map(s => del(`${base}/sequences/${s.id}`)));
  return Promise.all(steps.map(s => post<OutreachSequenceStep>(`${base}/sequences`, { ...s, campaign_id: campaignId })));
}

export const createSequenceStep = (d: Partial<OutreachSequenceStep>) => post<OutreachSequenceStep>(`${base}/sequences`, d);
export const updateSequenceStep = (id: string, d: Partial<OutreachSequenceStep>) => patch<OutreachSequenceStep>(`${base}/sequences/${id}`, d);
export const deleteSequenceStep = (id: string) => del(`${base}/sequences/${id}`);

// ─── Templates ────────────────────────────────────────────────────────────────
export const getTemplates    = ()                                          => get<OutreachTemplate[]>(`${base}/templates`);
export const createTemplate  = (name: string, subject: string, body: string) => post<OutreachTemplate>(`${base}/templates`, { name, subject, body });
export const updateTemplate  = (id: string, d: Partial<OutreachTemplate>) => patch<OutreachTemplate>(`${base}/templates/${id}`, d);
export const deleteTemplate  = (id: string)                               => del(`${base}/templates/${id}`);

// ─── CRM ──────────────────────────────────────────────────────────────────────
export const getCrmThreads    = (page = 0, status?: string) =>
  get<{ threads: CrmThread[]; total: number }>(`${base}/crm?page=${page}${status ? `&status=${status}` : ""}`);
export const updateCrmStatus  = (enrollmentId: string, crm_status: string) =>
  patch(`${base}/crm/${enrollmentId}`, { crm_status });
export const getCrmUnmatched  = () =>
  get<(OutreachReply & { inbox: { id: string; label: string | null; email_address: string } | null })[]>(`${base}/crm/unmatched`);
export const getCrmFilters    = ()                                         => get<OutreachCrmFilter[]>(`${base}/crm/filters`);
export const createCrmFilter  = (d: Omit<OutreachCrmFilter, "id" | "created_at" | "workspace_id">) => post<OutreachCrmFilter>(`${base}/crm/filters`, d);
export const deleteCrmFilter  = (id: string)                              => del(`${base}/crm/filters`, { id });
export const matchReply       = (replyId: string, enrollmentId: string)   =>
  patch(`${base}/crm/replies/${replyId}`, { enrollment_id: enrollmentId });
export const ignoreReply      = (replyId: string)                         =>
  patch(`${base}/crm/replies/${replyId}`, { is_filtered: true });

// ─── Warmup ───────────────────────────────────────────────────────────────────
export const getWarmup         = () => get<{ inboxes: OutreachInboxSafe[]; stats: Record<string, number> }>(`${base}/warmup`);
export const getWarmupActivity = (limit = 100) => get<unknown[]>(`${base}/warmup/activity?limit=${limit}`);

// ─── Analytics & Triggers ─────────────────────────────────────────────────────
export const getCampaignAnalytics = (campaignId: string) =>
  get<CampaignAnalytics>(`${base}/campaigns/${campaignId}/analytics`);

export const triggerSendBatch = (campaignId?: string) =>
  post<{
    queued: number;
    sends: { sent: number; failed: number };
    replies: { matched: number; details?: { email: string; fetched: number; matched: number; unmatched: number; error?: string }[] };
  }>(`${base}/campaigns/trigger`, campaignId ? { campaign_id: campaignId } : undefined);

export const sendTestEmail = (opts: {
  inbox_id: string; to_email: string; subject_template: string;
  body_template: string; lead_id?: string;
}) => post<{ ok: boolean; message?: string; error?: string }>(`${base}/inboxes/${opts.inbox_id}/test`, opts);

export const generateSequence = (opts: {
  product_name: string; target_audience: string; value_prop: string;
  tone?: string; num_emails?: number; wait_days_between?: number;
}) => post<{ steps?: { type: string; subject?: string; body?: string; wait_days?: number }[]; error?: string }>(`${base}/sequences/generate`, opts);

// ─── CRM extras ───────────────────────────────────────────────────────────────
export const addNote           = (enrollmentId: string, note: string) =>
  post(`${base}/crm/${enrollmentId}/notes`, { note });
export const suggestReply      = (enrollmentId: string) =>
  post<{ suggestion: string; error?: string }>(`${base}/crm/${enrollmentId}/suggest`, {});
export const ignoreCrmUnmatched = (replyId: string) => ignoreReply(replyId);
export const sendCrmReply      = (enrollmentId: string, body: string) =>
  post<{ ok: boolean; error?: string }>(`${base}/crm/${enrollmentId}/reply`, { body });
export const promoteUnmatched  = (replyId: string) =>
  post<{ ok: boolean; enrollment_id: string; error?: string }>(`${base}/crm/unmatched/${replyId}/promote`, {});

// ─── Settings ─────────────────────────────────────────────────────────────────
export const getSettings    = () => get<Record<string, unknown>>(`${base}/settings`);
export const updateSettings = (d: Record<string, unknown>) => patch(`${base}/settings`, d);
