/**
 * Typed API client — mobile port of apps/web/src/lib/outreach/api.ts
 * (same function names, same endpoints), plus the /api/mobile/* endpoints.
 */
import { wsGet, wsPost, wsPatch, wsDelete, wsFetch } from "./workspace";
import type {
  OutreachInboxSafe, OutreachCampaign, CrmThread, OutreachReply,
  CampaignAnalytics, ReplyAttachment, CrmNote,
} from "../types/outreach";

export interface ConversationMessage {
  id: string;
  type: "send" | "reply";
  timestamp: string;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  bounced_at?: string | null;
  to_email?: string | null;
  body_text?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  received_at?: string | null;
  ai_category?: string | null;
  ai_confidence?: number | null;
  attachments?: ReplyAttachment[];
  is_filtered?: boolean | null;
  inbox_email?: string | null;
  inbox_label?: string | null;
}

const base = "/api/outreach";

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const getCampaigns = () => wsGet<OutreachCampaign[]>(`${base}/campaigns`);
export const getCampaign  = (id: string) => wsGet<OutreachCampaign>(`${base}/campaigns/${id}`);
export const updateCampaign = (id: string, d: Partial<OutreachCampaign>) =>
  wsPatch<OutreachCampaign>(`${base}/campaigns/${id}`, d);
export const getCampaignAnalytics = (campaignId: string) =>
  wsGet<CampaignAnalytics>(`${base}/campaigns/${campaignId}/analytics`);

// ─── CRM ──────────────────────────────────────────────────────────────────────
export const getCrmThreads = (page = 0, status?: string) =>
  wsGet<{ threads: CrmThread[]; total: number }>(`${base}/crm?page=${page}${status ? `&status=${status}` : ""}`);
export const updateCrmStatus = (enrollmentId: string, crm_status: string) =>
  wsPatch(`${base}/crm/${enrollmentId}`, { crm_status });
export const toggleCrmStar = (enrollmentId: string, is_starred: boolean) =>
  wsPatch(`${base}/crm/${enrollmentId}`, { is_starred });
export const getConversation = (enrollmentId: string) =>
  wsGet<{ messages: ConversationMessage[]; notes: CrmNote[] }>(`${base}/crm/${enrollmentId}`);
export const sendCrmReply = (enrollmentId: string, body: string, html_body?: string) =>
  wsPost<{ ok: boolean; error?: string }>(`${base}/crm/${enrollmentId}/reply`, { body, html_body });
export const suggestReply = (enrollmentId: string) =>
  wsPost<{ suggestion: string; next_action?: string; action_reason?: string; error?: string }>(`${base}/crm/${enrollmentId}/suggest`, {});
export const addNote = (enrollmentId: string, note: string) =>
  wsPost(`${base}/crm/${enrollmentId}/notes`, { note });

export type CrmUnmatchedRow = OutreachReply & {
  inbox: { id: string; label: string | null; email_address: string } | null;
};
export const getCrmUnmatched = (page = 1, limit = 50) =>
  wsGet<{ data: CrmUnmatchedRow[]; total: number; page: number; limit: number }>(`${base}/crm/unmatched?page=${page}&limit=${limit}`);
export const matchReply = (replyId: string, enrollmentId: string) =>
  wsPatch(`${base}/crm/replies/${replyId}`, { enrollment_id: enrollmentId });
export const ignoreReply = (replyId: string) =>
  wsPatch(`${base}/crm/replies/${replyId}`, { is_filtered: true });
export const promoteUnmatched = (replyId: string) =>
  wsPost<{ ok: boolean; enrollment_id: string; error?: string }>(`${base}/crm/unmatched/${replyId}/promote`, {});

export type CrmWarmupRow = {
  id: string;
  sent_at: string;
  replied_at: string | null;
  subject: string | null;
  to_inbox:   { id: string; label: string | null; email_address: string } | null;
  from_inbox: { id: string; label: string | null; email_address: string; workspace_id: string } | null;
  workspace_id: string;
};
export const getCrmWarmup = () => wsGet<CrmWarmupRow[]>(`${base}/crm/warmup`);

// ─── Inboxes ──────────────────────────────────────────────────────────────────
export const getInboxes = () => wsGet<OutreachInboxSafe[]>(`${base}/inboxes`);

export interface DnsCheckResult {
  domain: string;
  checks: {
    spf:   { pass: boolean; record?: string; detail: string };
    dmarc: { pass: boolean; record?: string; detail: string };
    dkim:  { pass: boolean; selector?: string; detail: string };
    mx:    { pass: boolean; records?: string[]; detail: string };
  };
  score: number;
  max_score: number;
  error?: string;
}
export const checkInboxDns = (inboxId: string) =>
  wsGet<DnsCheckResult>(`${base}/inboxes/${inboxId}/dns-check`);

// ─── Mobile endpoints ─────────────────────────────────────────────────────────
export interface DailyPoint { date: string; sent: number; opened: number; replies: number }
export interface RecentThread {
  enrollment_id: string;
  crm_status:    string;
  lead:          { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null;
  campaign:      { name: string } | null;
  latest_reply:  { from_name: string | null; body_text: string | null; received_at: string; ai_category: string | null } | null;
  replied_at:    string | null;
}
export interface DashboardPayload {
  activeCampaigns: number;
  activeInboxes:   number;
  sentThisMonth:   number;
  openRate:        number;
  replies:         number;
  chartData:       DailyPoint[];
  recentActivity:  RecentThread[];
  errorInboxes:    { id: string; email_address: string; last_error: string | null }[];
  pausedCampaigns: { id: string; name: string }[];
}
export const getDashboard = () => wsGet<DashboardPayload>("/api/mobile/dashboard");

export interface WorkspaceSummary { id: string; name: string; slug: string; role: string }
export const getWorkspaces = () =>
  wsFetch<{ workspaces: WorkspaceSummary[] }>("/api/workspaces", { skipWorkspace: true });

export const registerDevice = (expo_push_token: string, platform: "ios" | "android", device_name?: string) =>
  wsPost<{ ok: boolean }>("/api/mobile/devices", { expo_push_token, platform, device_name });
export const unregisterDevice = (expo_push_token: string) =>
  wsDelete<{ ok: boolean }>("/api/mobile/devices", { expo_push_token });

export interface NotificationPrefs {
  replies_enabled:    boolean;
  positive_only:      boolean;
  milestones_enabled: boolean;
  health_enabled:     boolean;
  quiet_hours_start:  number | null;
  quiet_hours_end:    number | null;
  timezone:           string | null;
}
export const getPrefs = () => wsGet<{ prefs: NotificationPrefs }>("/api/mobile/prefs");
export const updatePrefs = (d: Partial<NotificationPrefs>) =>
  wsPatch<{ prefs: NotificationPrefs }>("/api/mobile/prefs", d);

export interface MobileNotification {
  id:         string;
  type:       "reply" | "milestone" | "health";
  title:      string;
  body:       string | null;
  data:       { enrollment_id?: string; campaign_id?: string; inbox_id?: string; ai_category?: string };
  read_at:    string | null;
  created_at: string;
}
export const getNotifications = (page = 0) =>
  wsGet<{ notifications: MobileNotification[]; total: number; unread_count: number; page: number; page_size: number }>(`/api/mobile/notifications?page=${page}`);
export const markNotificationsRead = (opts: { read_all?: boolean; ids?: string[] }) =>
  wsPatch<{ ok: boolean }>("/api/mobile/notifications", opts);
