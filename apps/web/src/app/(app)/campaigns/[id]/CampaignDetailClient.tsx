"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getCampaign, getSequence, updateCampaign, saveSequence,
  getInboxes, getTemplates, sendTestEmail, generateSequence,
  getCampaignAnalytics, triggerSendBatch,
  getCampaignEnrollments, unenrollLead, enrollLeads, getLists,
  checkInboxDns,
} from "@/lib/outreach/api";
import type {
  OutreachCampaign, OutreachSequenceStep, CampaignStatus,
  OutreachInboxSafe, OutreachTemplate, CampaignAnalytics,
  CampaignEnrollmentRow, OutreachList,
} from "@/types/outreach";

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft:     "text-white/40 bg-white/8",
  active:    "text-green-400 bg-green-500/15",
  paused:    "text-amber-400 bg-amber-500/15",
  completed: "text-orange-400 bg-orange-500/15",
};

const SEND_STATUS_COLORS: Record<string, string> = {
  sent:     "text-orange-400 bg-orange-500/15",
  opened:   "text-green-400 bg-green-500/15",
  replied:  "text-violet-400 bg-violet-500/15",
  bounced:  "text-red-400 bg-red-500/15",
  failed:   "text-red-400/60 bg-red-500/10",
  queued:   "text-white/30 bg-white/6",
};

const CRM_COLORS: Record<string, string> = {
  neutral:       "text-white/40",
  interested:    "text-orange-400",
  meeting_booked:"text-violet-400",
  won:           "text-green-400",
  not_interested:"text-red-400",
  ooo:           "text-amber-400",
  follow_up:     "text-orange-400",
};

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

type EditStep = {
  id?: string;
  type: "email" | "wait";
  wait_days: number;
  subject_template: string;
  subject_template_b: string;
  body_template: string;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-4">
      <p className="text-white/40 text-xs font-medium mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-white/30 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function Toggle({ value, onChange, color = "green" }: { value: boolean; onChange: (v: boolean) => void; color?: "green" | "amber" }) {
  return (
    <div onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 ${value ? (color === "amber" ? "bg-amber-500" : "bg-green-500") : "bg-white/15"}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? "?");
  return (
    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-bold flex-shrink-0">
      {initials.toUpperCase()}
    </div>
  );
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Tab = "overview" | "analytics" | "activity" | "queue" | "leads";

const COMMON_TIMEZONES = [
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Phoenix","America/Anchorage","Pacific/Honolulu",
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid",
  "Europe/Amsterdam","Europe/Stockholm","Europe/Zurich",
  "Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Asia/Shanghai",
  "Australia/Sydney","Australia/Melbourne","Pacific/Auckland",
];

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const enrolled = searchParams.get("enrolled") === "1";

  const [tab, setTab]             = useState<Tab>("overview");
  const [campaign, setCampaign]   = useState<OutreachCampaign | null>(null);
  const [steps, setSteps]         = useState<OutreachSequenceStep[]>([]);
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [inboxes, setInboxes]     = useState<OutreachInboxSafe[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);
  const [toast, setToast]         = useState<string | null>(enrolled ? "Campaign created and leads enrolled!" : null);

  // Activity filter
  const [activityFilter, setActivityFilter] = useState<string>("all");

  // Leads tab
  const [leadsData, setLeadsData]           = useState<{ enrollments: CampaignEnrollmentRow[]; total: number } | null>(null);
  const [leadsLoading, setLeadsLoading]     = useState(false);
  const [leadsPage, setLeadsPage]           = useState(0);
  const [leadsStatus, setLeadsStatus]       = useState("all");
  const [leadsSearch, setLeadsSearch]       = useState("");
  const [unenrolling, setUnenrolling]       = useState<string | null>(null);
  const [lists, setLists]                   = useState<OutreachList[]>([]);
  const [addListId, setAddListId]           = useState("");
  const [addingLeads, setAddingLeads]       = useState(false);
  const [addLeadsResult, setAddLeadsResult] = useState<string | null>(null);
  const LEADS_PAGE_SIZE = 50;

  // Edit form state
  const [editName, setEditName]               = useState("");
  const [editInboxes, setEditInboxes]         = useState<string[]>([]);
  const [editTimezone, setEditTimezone]       = useState("America/New_York");
  const [editStartTime, setEditStartTime]     = useState("09:00");
  const [editEndTime, setEditEndTime]         = useState("17:00");
  const [editDays, setEditDays]               = useState<string[]>(["mon","tue","wed","thu","fri"]);
  const [editDailyCap, setEditDailyCap]       = useState(100);
  const [editMinDelay, setEditMinDelay]       = useState(30);
  const [editMaxDelay, setEditMaxDelay]       = useState(120);
  const [editStopOnReply, setEditStopOnReply] = useState(true);
  const [editPauseAfterOpen, setEditPauseAfterOpen] = useState(false);
  const [editSteps, setEditSteps]             = useState<EditStep[]>([]);
  const [loadingTpl, setLoadingTpl]           = useState<number | null>(null);

  // AI generator
  const [showAiGen, setShowAiGen]       = useState(false);
  const [aiProduct, setAiProduct]       = useState("");
  const [aiAudience, setAiAudience]     = useState("");
  const [aiValueProp, setAiValueProp]   = useState("");
  const [aiTone, setAiTone]             = useState("professional");
  const [aiNumEmails, setAiNumEmails]   = useState(3);
  const [aiWaitDays, setAiWaitDays]     = useState(3);
  const [aiMessageLength, setAiMessageLength] = useState("standard");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);

  // Trigger sends
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  // Test email
  const [testStepIdx, setTestStepIdx]         = useState<number | null>(null);
  const [testInboxId, setTestInboxId]         = useState("");
  const [testInboxOpen, setTestInboxOpen]     = useState(false);
  const [testToEmail, setTestToEmail]         = useState("");
  const [testSending, setTestSending]         = useState(false);
  const [testResult, setTestResult]           = useState<string | null>(null);
  const [testSampleLeads, setTestSampleLeads] = useState<CampaignEnrollmentRow[]>([]);
  const [testSampleIdx, setTestSampleIdx]     = useState<number>(-1); // -1 = use fallback sample
  const [testPreviewTab, setTestPreviewTab]   = useState<"preview" | "plain">("preview");
  const [testDns, setTestDns]                 = useState<Awaited<ReturnType<typeof checkInboxDns>> | null>(null);
  const [testDnsLoading, setTestDnsLoading]   = useState(false);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    Promise.all([getCampaign(campaignId), getSequence(campaignId), getInboxes(), getTemplates()])
      .then(([c, s, i, t]) => {
        setCampaign(c); setSteps(s); setInboxes(i); setTemplates(t);
        setLoading(false);
      });
  }, [campaignId]);

  // Load analytics when tab changes to analytics/activity/queue
  useEffect(() => {
    if ((tab === "analytics" || tab === "activity" || tab === "queue") && !analytics) {
      setAnalyticsLoading(true);
      getCampaignAnalytics(campaignId).then(a => { setAnalytics(a); setAnalyticsLoading(false); });
    }
  }, [tab, analytics, campaignId]);

  // Load leads tab
  useEffect(() => {
    if (tab !== "leads") return;
    setLeadsLoading(true);
    Promise.all([
      getCampaignEnrollments(campaignId, leadsPage, LEADS_PAGE_SIZE, leadsStatus).catch(() => ({ enrollments: [], total: 0 })),
      lists.length === 0 ? getLists().catch(() => []) : Promise.resolve(lists),
    ]).then(([data, listData]) => {
      setLeadsData(data as { enrollments: CampaignEnrollmentRow[]; total: number });
      if (lists.length === 0) setLists(listData as OutreachList[]);
      setLeadsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, leadsPage, leadsStatus, campaignId]);

  // Load sample leads when test modal opens
  useEffect(() => {
    if (testStepIdx === null) return;
    getCampaignEnrollments(campaignId, 0, 20, "all")
      .then(d => setTestSampleLeads((d as { enrollments: CampaignEnrollmentRow[] }).enrollments ?? []))
      .catch(() => {});
  }, [testStepIdx, campaignId]);

  // Variable substitution for email preview
  function renderTemplate(tmpl: string, lead: CampaignEnrollmentRow["lead"]): string {
    if (!tmpl) return "";
    const vars: Record<string, string> = {
      first_name:  lead?.first_name  ?? "Jane",
      last_name:   lead?.last_name   ?? "Smith",
      company:     lead?.company     ?? "Acme Corp",
      title:       lead?.title       ?? "CEO",
      email:       lead?.email       ?? "jane@example.com",
    };
    return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  }

  function openEdit() {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditInboxes(campaign.inbox_ids ?? []);
    setEditTimezone(campaign.timezone ?? "America/New_York");
    setEditStartTime(campaign.send_start_time ?? "09:00");
    setEditEndTime(campaign.send_end_time ?? "17:00");
    setEditDays(campaign.send_days ?? ["mon","tue","wed","thu","fri"]);
    setEditDailyCap(campaign.daily_cap ?? 100);
    setEditMinDelay(campaign.min_delay_seconds ?? 30);
    setEditMaxDelay(campaign.max_delay_seconds ?? 120);
    setEditStopOnReply(campaign.stop_on_reply ?? true);
    setEditPauseAfterOpen(campaign.pause_after_open ?? false);
    setEditSteps(steps.map(s => ({ id: s.id, type: s.type, wait_days: s.wait_days ?? 0, subject_template: s.subject_template ?? "", subject_template_b: s.subject_template_b ?? "", body_template: s.body_template ?? "" })));
    setEditing(true);
  }

  async function handleSave() {
    if (!campaign) return;
    setSaving(true);
    const [updated] = await Promise.all([
      updateCampaign(campaign.id, { name: editName, inbox_ids: editInboxes, timezone: editTimezone, send_start_time: editStartTime, send_end_time: editEndTime, send_days: editDays, daily_cap: editDailyCap, min_delay_seconds: editMinDelay, max_delay_seconds: editMaxDelay, stop_on_reply: editStopOnReply, pause_after_open: editPauseAfterOpen }),
      saveSequence(campaign.id, editSteps.map(s => ({ ...s, subject_template_b: s.subject_template_b || null }))),
    ]);
    setCampaign(updated);
    const newSteps = await getSequence(campaign.id);
    setSteps(newSteps);
    setAnalytics(null); // invalidate analytics cache
    setSaving(false); setEditing(false);
    setToast("Campaign updated");
  }

  async function toggleStatus() {
    if (!campaign) return;
    const next: CampaignStatus = campaign.status === "active" ? "paused" : "active";
    setSaving(true);
    const updated = await updateCampaign(campaign.id, { status: next });
    setCampaign(updated); setSaving(false);
    setToast(`Campaign ${next === "active" ? "activated" : "paused"}`);
  }

  async function handleAiGenerate() {
    if (!aiProduct || !aiAudience || !aiValueProp) { setAiError("All fields required"); return; }
    setAiGenerating(true); setAiError(null);
    try {
      const result = await generateSequence({ product_name: aiProduct, target_audience: aiAudience, value_prop: aiValueProp, tone: aiTone, num_emails: aiNumEmails, wait_days_between: aiWaitDays, message_length: aiMessageLength });
      if (result.error) { setAiError(result.error); return; }
      if (result.steps) {
        setEditSteps(result.steps.map((s: { type: string; subject?: string; body?: string; wait_days?: number }) => ({ type: s.type as "email" | "wait", wait_days: s.wait_days ?? aiWaitDays, subject_template: s.subject ?? "", subject_template_b: "", body_template: s.body ?? "" })));
        setShowAiGen(false);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleTestSend() {
    if (testStepIdx === null || !testInboxId || !testToEmail) { setTestResult("Error: Inbox and recipient required"); return; }
    const s = editSteps[testStepIdx];
    const sampleLead = testSampleIdx >= 0 ? testSampleLeads[testSampleIdx]?.lead : null;
    setTestSending(true); setTestResult(null);
    const res = await sendTestEmail({ inbox_id: testInboxId, to_email: testToEmail, subject_template: s.subject_template, body_template: s.body_template, lead_id: sampleLead?.id || undefined });
    setTestSending(false);
    setTestResult(res.message ?? (res.error ? `Error: ${res.error}` : "Sent"));
  }

  async function handleCheckDns() {
    if (!testInboxId) return;
    setTestDnsLoading(true); setTestDns(null);
    const result = await checkInboxDns(testInboxId).catch(e => ({ error: e.message } as never));
    setTestDns(result);
    setTestDnsLoading(false);
  }

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />)}
    </div>
  );
  if (!campaign) return <div className="p-6 text-white/40">Campaign not found.</div>;

  const openRate  = campaign.total_sent ? ((campaign.total_opened ?? 0) / campaign.total_sent * 100).toFixed(1) : "0";
  const replyRate = campaign.total_sent ? ((campaign.total_replied ?? 0) / campaign.total_sent * 100).toFixed(1) : "0";
  const emailSteps = steps.filter(s => s.type === "email");

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setEditing(false)} className="text-white/30 text-sm hover:text-white/60 transition-colors mb-1 flex items-center gap-1">← Back</button>
            <h1 className="text-xl font-bold text-white">Edit Campaign</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="px-4 py-2 bg-white/8 hover:bg-white/12 text-white/60 text-sm rounded-xl border border-white/10 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>

        <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Campaign Name</label>
          <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/50" /></div>

        <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Sending Inboxes {editInboxes.length > 0 && <span className="text-orange-400 normal-case ml-1">{editInboxes.length} selected</span>}</label>
          <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
            {inboxes.map(inbox => (
              <label key={inbox.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${editInboxes.includes(inbox.id) ? "border-orange-500/40 bg-orange-500/10" : "border-white/8 bg-white/3 hover:bg-white/5"}`}>
                <input type="checkbox" checked={editInboxes.includes(inbox.id)} onChange={() => setEditInboxes(p => p.includes(inbox.id) ? p.filter(x => x !== inbox.id) : [...p, inbox.id])} className="accent-orange-500" />
                <div><div className="text-white text-sm font-medium">{inbox.label}</div><div className="text-white/35 text-xs">{inbox.email_address} · {inbox.daily_send_limit}/day</div></div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Timezone</label>
          <select value={editTimezone} onChange={e => setEditTimezone(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50">
            {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <p className="text-white/25 text-xs mt-1">Send window times are interpreted in this timezone</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Window Start</label><input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" /></div>
          <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Window End</label><input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" /></div>
        </div>

        <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send Days</label>
          <div className="flex gap-2">{DAYS.map(d => <button key={d} onClick={() => setEditDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])} className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-all ${editDays.includes(d) ? "bg-orange-500/20 border-orange-500/40 text-orange-300" : "bg-white/4 border-white/8 text-white/30"}`}>{d.slice(0,1).toUpperCase()+d.slice(1,2)}</button>)}</div>
        </div>

        <div><label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Daily Send Cap</label><input type="number" value={editDailyCap} onChange={e => setEditDailyCap(parseInt(e.target.value))} min={1} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" /></div>

        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Send Throttle</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-white/40 mb-1">Min Delay (s)</label><input type="number" value={editMinDelay} onChange={e => setEditMinDelay(parseInt(e.target.value)||30)} min={5} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" /></div>
            <div><label className="block text-xs text-white/40 mb-1">Max Delay (s)</label><input type="number" value={editMaxDelay} onChange={e => setEditMaxDelay(parseInt(e.target.value)||120)} min={5} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" /></div>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Campaign Behavior</p>
          <div className="flex items-center justify-between"><div><p className="text-white/80 text-sm font-medium">Stop on Reply</p><p className="text-white/35 text-xs">Halt sequence when a lead replies</p></div><Toggle value={editStopOnReply} onChange={setEditStopOnReply} /></div>
          <div className="flex items-center justify-between"><div><p className="text-white/80 text-sm font-medium">Pause After Open</p><p className="text-white/35 text-xs">Pause when a lead opens an email</p></div><Toggle value={editPauseAfterOpen} onChange={setEditPauseAfterOpen} color="amber" /></div>
        </div>

        {/* Sequence editor */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Email Sequence</h2>
            <button onClick={() => { setShowAiGen(true); setAiError(null); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              AI Generate
            </button>
          </div>
          <p className="text-white/40 text-xs mb-3">Use {`{{first_name}}, {{company}}, {{title}}`} as variables.</p>
          <div className="space-y-3">
            {editSteps.map((s, i) => (
              <div key={i} className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Step {i+1} · {s.type === "wait" ? `Wait ${s.wait_days}d` : "Email"}</span>
                  <button onClick={() => setEditSteps(st => st.filter((_,idx) => idx !== i))} className="text-red-400/60 hover:text-red-400 text-xs">Remove</button>
                </div>
                {s.type === "wait" ? (
                  <div className="flex items-center gap-3"><span className="text-white/40 text-sm">Wait</span><input type="number" value={s.wait_days} onChange={e => setEditSteps(st => st.map((st2,idx) => idx===i?{...st2,wait_days:parseInt(e.target.value)||1}:st2))} min={1} className="w-20 bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none" /><span className="text-white/40 text-sm">days</span></div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {templates.length > 0 && (
                        <div className="relative">
                          <button onClick={() => setLoadingTpl(loadingTpl===i?null:i)} className="text-orange-400 hover:text-orange-300 text-xs">Load Template ▾</button>
                          {loadingTpl === i && (
                            <div className="absolute left-0 top-6 z-20 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl py-1 min-w-56 max-h-48 overflow-y-auto">
                              {templates.map(t => <button key={t.id} onClick={() => { setEditSteps(st => st.map((st2,idx) => idx===i?{...st2,subject_template:t.subject,body_template:t.body}:st2)); setLoadingTpl(null); }} className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors"><div className="font-medium text-white/90">{t.name}</div><div className="text-white/35 text-xs truncate">{t.subject}</div></button>)}
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={() => { setTestStepIdx(i); setTestResult(null); setTestSampleIdx(-1); setTestToEmail(""); setTestInboxId(editInboxes[0]??""); }} className="text-amber-400/80 hover:text-amber-300 text-xs ml-auto">Send Test ↗</button>
                    </div>
                    <div><label className="block text-xs text-white/40 mb-1">Subject {s.subject_template_b ? "(Variant A)" : ""}</label><input value={s.subject_template} onChange={e => setEditSteps(st => st.map((st2,idx) => idx===i?{...st2,subject_template:e.target.value}:st2))} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40" /></div>
                    <div><label className="block text-xs text-white/40 mb-1">Subject B <span className="text-white/20">(A/B test)</span></label><input value={s.subject_template_b} onChange={e => setEditSteps(st => st.map((st2,idx) => idx===i?{...st2,subject_template_b:e.target.value}:st2))} placeholder="Alternate subject" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/40" /></div>
                    <textarea value={s.body_template} onChange={e => setEditSteps(st => st.map((st2,idx) => idx===i?{...st2,body_template:e.target.value}:st2))} rows={5} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40 resize-none" />
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-3">
            <button onClick={() => setEditSteps(s => [...s, { type: "email", wait_days: 0, subject_template: "Following up", subject_template_b: "", body_template: "Hi {{first_name}},\n\n" }])} className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">+ Add Email</button>
            <button onClick={() => setEditSteps(s => [...s, { type: "wait", wait_days: 3, subject_template: "", subject_template_b: "", body_template: "" }])} className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">+ Add Wait Step</button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/8">
          <button onClick={() => setEditing(false)} className="px-5 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 text-sm rounded-xl transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">{saving ? "Saving…" : "Save Changes"}</button>
        </div>

        {/* AI Generator modal */}
        {showAiGen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                <h2 className="text-white font-semibold text-sm">AI Sequence Generator</h2>
                <button onClick={() => setShowAiGen(false)} className="text-white/40 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-6 space-y-4">
                {aiError && <div className="px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs">{aiError}</div>}
                <div><label className="block text-xs text-white/40 mb-1">Product / Service</label><input value={aiProduct} onChange={e => setAiProduct(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40" /></div>
                <div><label className="block text-xs text-white/40 mb-1">Target Audience</label><input value={aiAudience} onChange={e => setAiAudience(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40" /></div>
                <div><label className="block text-xs text-white/40 mb-1">Value Proposition</label><input value={aiValueProp} onChange={e => setAiValueProp(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-white/40 mb-1">Tone</label><select value={aiTone} onChange={e => setAiTone(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="direct">Direct</option><option value="casual">Casual</option></select></div>
                  <div><label className="block text-xs text-white/40 mb-1">Message Length</label><select value={aiMessageLength} onChange={e => setAiMessageLength(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed</option><option value="comprehensive">Comprehensive</option></select></div>
                  <div><label className="block text-xs text-white/40 mb-1">Emails</label><input type="number" value={aiNumEmails} onChange={e => setAiNumEmails(parseInt(e.target.value)||3)} min={1} max={7} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" /></div>
                  <div><label className="block text-xs text-white/40 mb-1">Wait Days</label><input type="number" value={aiWaitDays} onChange={e => setAiWaitDays(parseInt(e.target.value)||3)} min={1} max={14} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" /></div>
                </div>
                <button onClick={handleAiGenerate} disabled={aiGenerating} className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2">
                  {aiGenerating ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</> : "Generate Sequence"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Test Email modal */}
        {testStepIdx !== null && (() => {
          const step = editSteps[testStepIdx];
          const sampleLead = testSampleIdx >= 0 ? testSampleLeads[testSampleIdx]?.lead ?? null : null;
          const renderedSubject = renderTemplate(step?.subject_template ?? "", sampleLead);
          const renderedBody    = renderTemplate(step?.body_template    ?? "", sampleLead);
          const selectedInbox   = inboxes.find(i => i.id === testInboxId);
          const isHtml          = /<[a-z][\s\S]*>/i.test(renderedBody);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setTestInboxOpen(false)}>
              <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <h2 className="text-white font-semibold text-sm">Send Test Email</h2>
                    <div className="flex items-center gap-1">
                      {editSteps.map((_, i) => (
                        <button key={i} onClick={() => { setTestStepIdx(i); setTestResult(null); setTestDns(null); }}
                          className={`w-6 h-6 rounded-full text-[11px] font-semibold transition-colors ${i === testStepIdx ? "bg-orange-500 text-white" : "bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70"}`}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <span className="text-white/20 text-xs">Step {testStepIdx + 1} of {editSteps.length}</span>
                  </div>
                  <button onClick={() => { setTestStepIdx(null); setTestResult(null); setTestDns(null); setTestInboxOpen(false); }} className="text-white/40 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">

                  {/* ── LEFT: Config ── */}
                  <div className="w-72 flex-shrink-0 border-r border-white/8 flex flex-col overflow-y-auto">
                    <div className="p-5 space-y-4 flex-1">

                      {/* Send From */}
                      <div>
                        <label className="block text-xs text-white/40 mb-2 font-medium">Send From</label>
                        <div className="relative">
                          <button type="button" onClick={e => { e.stopPropagation(); setTestInboxOpen(v => !v); }}
                            className="w-full flex items-center gap-2.5 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 hover:bg-white/8 transition-colors text-left">
                            {selectedInbox ? (
                              <>
                                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-orange-300">
                                  {selectedInbox.email_address[0].toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-xs font-medium truncate">{selectedInbox.email_address}</p>
                                  {selectedInbox.label && <p className="text-white/35 text-[10px] truncate">{selectedInbox.label}</p>}
                                </div>
                              </>
                            ) : (
                              <span className="text-white/30 text-sm flex-1">Select inbox…</span>
                            )}
                            <svg className={`w-4 h-4 text-white/25 flex-shrink-0 transition-transform ${testInboxOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {testInboxOpen && (
                            <div className="absolute top-full mt-1 left-0 right-0 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-20 max-h-52 overflow-y-auto">
                              {inboxes.map(inbox => (
                                <button key={inbox.id} type="button"
                                  onClick={() => { setTestInboxId(inbox.id); setTestInboxOpen(false); setTestDns(null); }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/6 transition-colors text-left ${testInboxId === inbox.id ? "bg-white/8" : ""}`}>
                                  <div className="w-7 h-7 bg-orange-500/15 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-orange-300/70">
                                    {inbox.email_address[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-white text-xs font-medium truncate">{inbox.email_address}</p>
                                    {inbox.label && <p className="text-white/30 text-[10px] truncate">{inbox.label}</p>}
                                  </div>
                                  {testInboxId === inbox.id && <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Send To */}
                      <div>
                        <label className="block text-xs text-white/40 mb-2 font-medium">Send To</label>
                        <input type="email" value={testToEmail} onChange={e => setTestToEmail(e.target.value)}
                          placeholder="you@domain.com"
                          className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
                      </div>

                      {/* Lead Sample */}
                      <div>
                        <label className="block text-xs text-white/40 mb-2 font-medium">
                          Lead Sample <span className="text-white/20 font-normal">(for variable preview)</span>
                        </label>
                        <select value={testSampleIdx} onChange={e => setTestSampleIdx(Number(e.target.value))}
                          className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-white/25 transition-colors appearance-none">
                          <option value={-1}>Sample data (Jane Smith, Acme Corp)</option>
                          {testSampleLeads.map((e, i) => e.lead && (
                            <option key={e.id} value={i}>
                              {[e.lead.first_name, e.lead.last_name].filter(Boolean).join(" ") || e.lead.email}
                              {e.lead.company ? ` · ${e.lead.company}` : ""}
                            </option>
                          ))}
                        </select>
                        {(testSampleIdx >= 0 && testSampleLeads[testSampleIdx]?.lead) && (
                          <div className="mt-2 px-3 py-2 bg-white/4 rounded-lg text-[10px] text-white/40 space-y-0.5">
                            <p>{testSampleLeads[testSampleIdx]!.lead!.email}</p>
                            {testSampleLeads[testSampleIdx]!.lead!.title && <p>{testSampleLeads[testSampleIdx]!.lead!.title}</p>}
                          </div>
                        )}
                      </div>

                      {/* Deliverability Check */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-white/40 font-medium">Deliverability</label>
                          {testDns?.score !== undefined && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${testDns.score === 4 ? "bg-emerald-500/15 text-emerald-400" : testDns.score >= 2 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                              {testDns.score}/{testDns.max_score} checks passed
                            </span>
                          )}
                        </div>
                        <button onClick={handleCheckDns} disabled={!testInboxId || testDnsLoading}
                          className="w-full py-2 bg-white/6 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white/70 text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
                          {testDnsLoading ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Checking DNS…</> : "Check SPF / DKIM / DMARC"}
                        </button>
                        {testDns && !("error" in testDns && testDns.error) && testDns.checks && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] text-white/25 font-medium uppercase tracking-wide">{testDns.domain}</p>
                            {(Object.entries(testDns.checks) as [string, { pass: boolean; detail: string }][]).map(([key, check]) => (
                              <div key={key} className="flex items-start gap-2">
                                <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${check.pass ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                  {check.pass ? "✓" : "✗"}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">{key} </span>
                                  <span className="text-[10px] text-white/30">{check.detail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {testDns && "error" in testDns && testDns.error && (
                          <p className="mt-2 text-[10px] text-red-400/70">{String(testDns.error)}</p>
                        )}
                      </div>
                    </div>

                    {/* Send button pinned to bottom */}
                    <div className="p-5 border-t border-white/8 space-y-2 flex-shrink-0">
                      {testResult && (
                        <div className={`px-3 py-2 rounded-lg text-xs ${testResult.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                          {testResult}
                        </div>
                      )}
                      <button onClick={handleTestSend} disabled={testSending || !testInboxId || !testToEmail}
                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors">
                        {testSending ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Test Email</>}
                      </button>
                    </div>
                  </div>

                  {/* ── RIGHT: Preview ── */}
                  <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                    {/* Subject bar */}
                    <div className="px-6 py-3 border-b border-white/8 flex-shrink-0">
                      <p className="text-[10px] text-white/30 font-medium uppercase tracking-wide mb-1">Subject</p>
                      <p className="text-white/80 text-sm font-medium truncate">{renderedSubject || <span className="text-white/20 italic">No subject</span>}</p>
                    </div>

                    {/* Preview tabs */}
                    <div className="flex items-center gap-1 px-6 py-2.5 border-b border-white/8 flex-shrink-0">
                      <button onClick={() => setTestPreviewTab("preview")}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${testPreviewTab === "preview" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
                        Preview
                      </button>
                      <button onClick={() => setTestPreviewTab("plain")}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${testPreviewTab === "plain" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
                        Plain Text
                      </button>
                      <div className="flex-1" />
                      {sampleLead && (
                        <span className="text-[10px] text-white/25">Previewing as {sampleLead.first_name ?? sampleLead.email}</span>
                      )}
                    </div>

                    {/* Email body */}
                    <div className="flex-1 overflow-auto bg-white/2">
                      {testPreviewTab === "preview" ? (
                        isHtml ? (
                          <iframe
                            key={renderedBody}
                            srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:24px;font-family:sans-serif;font-size:14px;color:#333;line-height:1.6;background:#fff}a{color:#1a73e8}*{max-width:100%;box-sizing:border-box}</style></head><body>${renderedBody}</body></html>`}
                            sandbox="allow-same-origin"
                            className="w-full border-0 bg-white"
                            style={{ minHeight: "400px" }}
                            onLoad={e => { const f = e.currentTarget; if (f.contentDocument?.body) f.style.height = f.contentDocument.body.scrollHeight + 48 + "px"; }}
                          />
                        ) : (
                          <div className="p-6">
                            <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans leading-relaxed">{renderedBody || <span className="text-white/20 italic">No body content</span>}</pre>
                          </div>
                        )
                      ) : (
                        <div className="p-6">
                          <pre className="text-white/50 text-xs whitespace-pre-wrap font-mono leading-relaxed break-all">{step?.body_template || "(empty)"}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  const AnalyticsSpinner = () => (
    <div className="flex items-center justify-center py-20">
      <svg className="w-6 h-6 animate-spin text-white/30" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {toast && <div className="fixed top-5 right-5 z-50 px-5 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/campaigns" className="text-white/30 text-sm hover:text-white/60 transition-colors">Campaigns</Link>
            <span className="text-white/20">›</span>
            <span className="text-white/60 text-sm">{campaign.name}</span>
          </div>
          <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[campaign.status]}`}>{campaign.status}</span>
            <span className="text-white/30 text-xs">{campaign.send_days?.join(", ")} · {campaign.send_start_time}–{campaign.send_end_time}</span>
            <span className="text-white/30 text-xs">{campaign.daily_cap} emails/day</span>
            {campaign.stop_on_reply && <span className="text-white/20 text-xs">stops on reply</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={openEdit} className="px-4 py-2 bg-white/8 hover:bg-white/12 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">Edit</button>
          {campaign.status !== "completed" && (
            <button onClick={toggleStatus} disabled={saving} className="px-4 py-2 bg-white/8 hover:bg-white/12 disabled:opacity-50 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">
              {saving ? "…" : campaign.status === "active" ? "Pause" : "Activate"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8 pb-0">
        {(["overview", "analytics", "activity", "queue", "leads"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize rounded-t-lg transition-colors border-b-2 -mb-px ${tab === t ? "text-white border-orange-500" : "text-white/40 border-transparent hover:text-white/70"}`}
          >
            {t}
            {t === "queue" && analytics && analytics.upcoming_queue.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-orange-500/30 text-orange-300 text-[10px] rounded-full">{analytics.upcoming_queue.length}</span>
            )}
            {t === "leads" && campaign && (campaign.total_enrolled ?? 0) > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/10 text-white/50 text-[10px] rounded-full">{(campaign.total_enrolled ?? 0).toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ───────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Primary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Enrolled"   value={(campaign.total_enrolled ?? 0).toLocaleString()} />
            <StatCard label="Sent"       value={(campaign.total_sent ?? 0).toLocaleString()} />
            <StatCard label="Open Rate"  value={`${openRate}%`} sub={`${(campaign.total_opened ?? 0).toLocaleString()} opens`} />
            <StatCard label="Reply Rate" value={`${replyRate}%`} sub={`${(campaign.total_replied ?? 0).toLocaleString()} replies`} />
          </div>

          {/* Secondary pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Completed",    value: campaign.total_completed    ?? 0, color: "text-orange-400 bg-orange-500/10" },
              { label: "Bounced",      value: campaign.total_bounced      ?? 0, color: "text-red-400 bg-red-500/10" },
              { label: "Unsubscribed", value: campaign.total_unsubscribed ?? 0, color: "text-amber-400 bg-amber-500/10" },
              { label: "Clicked",      value: campaign.total_clicked      ?? 0, color: "text-violet-400 bg-violet-500/10" },
            ].map(p => (
              <div key={p.label} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 ${p.color}`}>
                <span className="font-bold">{p.value.toLocaleString()}</span> {p.label}
              </div>
            ))}
          </div>

          {/* Sequence */}
          <div>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Email Sequence</h2>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 ${s.type === "wait" ? "bg-white/5 border-white/12 text-white/30" : "bg-orange-500/20 border-orange-500/30 text-orange-300"}`}>{i+1}</div>
                    {i < steps.length - 1 && <div className="w-px h-6 bg-white/8" />}
                  </div>
                  <div className={`flex-1 rounded-xl border p-4 mb-1 ${s.type === "wait" ? "bg-white/2 border-white/6" : "bg-white/4 border-white/8"}`}>
                    {s.type === "wait" ? (
                      <p className="text-white/40 text-sm">Wait <span className="font-semibold text-white/60">{s.wait_days} day{s.wait_days !== 1 ? "s" : ""}</span></p>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/60 bg-orange-500/10 px-2 py-0.5 rounded-full">Email #{emailSteps.indexOf(s)+1}</span>
                          {s.subject_template_b && <span className="text-[10px] text-violet-400/60 bg-violet-500/10 px-2 py-0.5 rounded-full">A/B</span>}
                        </div>
                        <p className="text-white font-medium text-sm">{s.subject_template || "(no subject)"}</p>
                        {s.subject_template_b && <p className="text-white/35 text-xs">B: {s.subject_template_b}</p>}
                        <p className="text-white/40 text-xs line-clamp-2 font-mono whitespace-pre-line">{s.body_template}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Settings</h2>
            <div className="bg-white/4 border border-white/8 rounded-xl divide-y divide-white/5">
              {[
                ["Timezone",         campaign.timezone],
                ["Send Window",      `${campaign.send_start_time}–${campaign.send_end_time}`],
                ["Send Days",        campaign.send_days?.join(", ") ?? "—"],
                ["Daily Cap",        `${campaign.daily_cap} emails`],
                ["Throttle",         `${campaign.min_delay_seconds ?? 30}–${campaign.max_delay_seconds ?? 120}s`],
                ["Stop on Reply",    campaign.stop_on_reply ? "Yes" : "No"],
                ["Pause After Open", campaign.pause_after_open ? "Yes" : "No"],
                ["Track Opens",      campaign.track_opens  ? "Yes" : "No"],
                ["Track Clicks",     campaign.track_clicks ? "Yes" : "No"],
                ["Created",          new Date(campaign.created_at).toLocaleDateString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center px-5 py-3 text-sm">
                  <span className="text-white/40">{k}</span><span className="text-white/80">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ANALYTICS ──────────────────────────────────────────────────── */}
      {tab === "analytics" && (
        analyticsLoading || !analytics ? <AnalyticsSpinner /> : (
          <div className="space-y-6">
            {/* Enrollment funnel */}
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Enrollment Funnel</h2>
              <div className="space-y-2.5">
                {[
                  { label: "Enrolled",     value: analytics.funnel.enrolled,     color: "bg-white/30",      pct: 100 },
                  { label: "Sent",         value: analytics.funnel.sent,         color: "bg-orange-500",      pct: analytics.funnel.enrolled ? analytics.funnel.sent / analytics.funnel.enrolled * 100 : 0 },
                  { label: "Opened",       value: analytics.funnel.opened,       color: "bg-green-500",     pct: analytics.funnel.enrolled ? analytics.funnel.opened / analytics.funnel.enrolled * 100 : 0 },
                  { label: "Replied",      value: analytics.funnel.replied,      color: "bg-violet-500",    pct: analytics.funnel.enrolled ? analytics.funnel.replied / analytics.funnel.enrolled * 100 : 0 },
                  { label: "Completed",    value: analytics.funnel.completed,    color: "bg-orange-400/50",   pct: analytics.funnel.enrolled ? analytics.funnel.completed / analytics.funnel.enrolled * 100 : 0 },
                  { label: "Bounced",      value: analytics.funnel.bounced,      color: "bg-red-500",       pct: analytics.funnel.enrolled ? analytics.funnel.bounced / analytics.funnel.enrolled * 100 : 0 },
                  { label: "Unsubscribed", value: analytics.funnel.unsubscribed, color: "bg-amber-500/60",  pct: analytics.funnel.enrolled ? analytics.funnel.unsubscribed / analytics.funnel.enrolled * 100 : 0 },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-white/40 text-xs w-24 text-right flex-shrink-0">{row.label}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${Math.max(row.pct, row.value > 0 ? 2 : 0)}%` }} />
                    </div>
                    <span className="text-white/60 text-xs w-20 flex-shrink-0">{row.value.toLocaleString()} <span className="text-white/25">({row.pct.toFixed(1)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-step table */}
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Per-Step Performance</h2>
              <div className="border border-white/8 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2.5 bg-white/3 border-b border-white/6">
                  {["Step", "Subject", "Sent", "Open Rate", "Reply Rate", "Bounced"].map(h => <div key={h} className="text-white/35 text-xs font-semibold uppercase tracking-wider">{h}</div>)}
                </div>
                {analytics.per_step.filter(s => s.type === "email").map((s, i) => (
                  <div key={i} className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr] gap-3 items-center px-4 py-3 border-b border-white/4 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</div>
                    <div>
                      <p className="text-white/80 text-xs truncate">{s.subject_template || "(no subject)"}</p>
                      {s.subject_template_b && <p className="text-violet-400/60 text-[10px] truncate">B: {s.subject_template_b}</p>}
                    </div>
                    <div className="text-white/60 text-sm">{s.sent.toLocaleString()}</div>
                    <div className={`text-sm font-medium ${s.open_rate > 30 ? "text-green-400" : s.open_rate > 15 ? "text-amber-400" : "text-white/50"}`}>{s.open_rate}%</div>
                    <div className={`text-sm font-medium ${s.reply_rate > 5 ? "text-green-400" : s.reply_rate > 2 ? "text-amber-400" : "text-white/50"}`}>{s.reply_rate}%</div>
                    <div className="text-white/40 text-sm">{s.bounced}</div>
                  </div>
                ))}
                {analytics.per_step.filter(s => s.type === "email").length === 0 && (
                  <div className="px-4 py-6 text-white/30 text-sm text-center">No email steps have been sent yet</div>
                )}
              </div>
            </div>

            {/* A/B test panel */}
            {analytics.ab_test.enabled && (
              <div>
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">A/B Test Results</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(["a", "b"] as const).map(variant => {
                    const d = analytics.ab_test[variant];
                    return (
                      <div key={variant} className="bg-white/4 border border-white/8 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${variant === "a" ? "bg-orange-500/30 text-orange-300" : "bg-violet-600/30 text-violet-300"}`}>{variant.toUpperCase()}</span>
                          <span className="text-white/60 text-sm font-medium">Variant {variant.toUpperCase()}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm"><span className="text-white/40">Sent</span><span className="text-white/70">{d.sent.toLocaleString()}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-white/40">Open Rate</span><span className={d.open_rate > 25 ? "text-green-400 font-medium" : "text-white/70"}>{d.open_rate}%</span></div>
                          <div className="flex justify-between text-sm"><span className="text-white/40">Reply Rate</span><span className={d.reply_rate > 5 ? "text-green-400 font-medium" : "text-white/70"}>{d.reply_rate}%</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily activity chart */}
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Daily Activity — Last 30 Days</h2>
              {(() => {
                const maxVal = Math.max(...analytics.daily_activity.map(d => d.sent), 1);
                const hasSends = analytics.daily_activity.some(d => d.sent > 0);
                return hasSends ? (
                  <div>
                    <div className="flex items-end gap-0.5 h-24">
                      {analytics.daily_activity.map(day => (
                        <div key={day.date} title={`${day.date}: ${day.sent} sent, ${day.opened} opened, ${day.replied} replied`} className="flex-1 flex flex-col justify-end gap-px group">
                          <div className="w-full bg-violet-500/70 rounded-[1px] transition-all group-hover:bg-violet-400" style={{ height: `${Math.max((day.replied / maxVal) * 88, day.replied > 0 ? 4 : 0)}px` }} />
                          <div className="w-full bg-green-500/70 rounded-[1px] transition-all group-hover:bg-green-400" style={{ height: `${Math.max((day.opened / maxVal) * 88, day.opened > 0 ? 4 : 0)}px` }} />
                          <div className="w-full bg-orange-500/70 rounded-[1px] transition-all group-hover:bg-orange-400" style={{ height: `${Math.max((day.sent / maxVal) * 88, day.sent > 0 ? 4 : 0)}px` }} />
                        </div>
                      ))}
                    </div>
                    {/* X-axis: show every 5th date */}
                    <div className="flex mt-1.5">
                      {analytics.daily_activity.map((day, i) => (
                        <div key={day.date} className="flex-1 text-center">
                          {i % 5 === 0 && <span className="text-white/20 text-[8px]">{day.date.slice(5)}</span>}
                        </div>
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-2">
                      {[{color:"bg-orange-500/70", label:"Sent"},{color:"bg-green-500/70", label:"Opened"},{color:"bg-violet-500/70", label:"Replied"}].map(l => (
                        <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-[2px] ${l.color}`}/><span className="text-white/35 text-xs">{l.label}</span></div>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-white/25 text-sm">No sends recorded yet.</p>;
              })()}
            </div>
          </div>
        )
      )}

      {/* ── TAB: ACTIVITY ───────────────────────────────────────────────────── */}
      {tab === "activity" && (
        analyticsLoading || !analytics ? <AnalyticsSpinner /> : (
          <div className="space-y-4">
            {/* Status filter */}
            <div className="flex gap-2 flex-wrap">
              {["all","sent","opened","replied","bounced"].map(f => (
                <button key={f} onClick={() => setActivityFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${activityFilter === f ? "bg-white/15 text-white" : "bg-white/5 text-white/40 hover:text-white/60"}`}>{f}</button>
              ))}
            </div>

            {/* Activity feed */}
            <div className="space-y-1">
              {analytics.recent_activity
                .filter(a => {
                  if (activityFilter === "all")     return true;
                  if (activityFilter === "replied")  return a.replied_at;
                  if (activityFilter === "opened")   return a.opened_at;
                  return a.status === activityFilter;
                })
                .map(a => {
                  const displayStatus = a.replied_at ? "replied" : a.opened_at ? "opened" : a.status;
                  return (
                    <div key={a.send_id} className="flex items-center gap-3 px-4 py-3 bg-white/3 hover:bg-white/5 rounded-xl transition-colors">
                      <Initials name={a.lead_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white/80 text-sm font-medium truncate">{a.lead_name}</span>
                          {a.company && <span className="text-white/30 text-xs truncate">· {a.company}</span>}
                        </div>
                        <p className="text-white/40 text-xs truncate">{a.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-orange-400/60 bg-orange-500/10 px-1.5 py-0.5 rounded">Step {a.step_order + 1}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEND_STATUS_COLORS[displayStatus] ?? "text-white/30 bg-white/6"}`}>{displayStatus}</span>
                        <span className="text-white/25 text-xs w-16 text-right">{timeAgo(a.replied_at ?? a.opened_at ?? a.sent_at)}</span>
                      </div>
                    </div>
                  );
                })}
              {analytics.recent_activity.filter(a => {
                if (activityFilter === "all")    return true;
                if (activityFilter === "replied") return a.replied_at;
                if (activityFilter === "opened")  return a.opened_at;
                return a.status === activityFilter;
              }).length === 0 && (
                <div className="text-center py-12 text-white/25 text-sm">No activity for this filter.</div>
              )}
            </div>
          </div>
        )
      )}

      {/* ── TAB: QUEUE ──────────────────────────────────────────────────────── */}
      {tab === "queue" && (
        analyticsLoading || !analytics ? <AnalyticsSpinner /> : (
          <div className="space-y-4">
            {campaign.status !== "active" && (
              <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
                Campaign is {campaign.status} — no sends will go out until it's activated.
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-white/40 text-sm">{analytics.upcoming_queue.length} lead{analytics.upcoming_queue.length !== 1 ? "s" : ""} in queue</p>
              <div className="flex items-center gap-3">
                {triggerResult && <span className="text-green-400 text-xs">{triggerResult}</span>}
                <button
                  onClick={async () => {
                    setTriggering(true);
                    setTriggerResult(null);
                    try {
                      const r = await triggerSendBatch();
                      setTriggerResult(`Sent ${r.sends.sent} · Replies found ${r.replies.matched}`);
                      // Reload analytics to reflect new sends
                      const fresh = await getCampaignAnalytics(campaignId);
                      setAnalytics(fresh);
                    } finally {
                      setTriggering(false);
                    }
                  }}
                  disabled={triggering || campaign.status !== "active"}
                  className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-orange-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  {triggering ? "Sending…" : "⚡ Trigger Sends"}
                </button>
              </div>
            </div>

            {analytics.upcoming_queue.length > 0 ? (
              <div className="border border-white/8 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 bg-white/3 border-b border-white/6">
                  {["Lead", "Company", "Step", "Scheduled For", "CRM Status"].map(h => (
                    <div key={h} className="text-white/35 text-xs font-semibold uppercase tracking-wider">{h}</div>
                  ))}
                </div>
                {analytics.upcoming_queue.map(q => {
                  const isDue = !q.next_send_at || new Date(q.next_send_at) <= new Date();
                  return (
                    <div key={q.enrollment_id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
                      <div>
                        <p className="text-white/80 text-sm font-medium">{q.lead_name}</p>
                        <p className="text-white/30 text-xs">{q.lead_email}</p>
                      </div>
                      <div className="text-white/50 text-sm truncate">{q.company ?? "—"}</div>
                      <div className="text-orange-300/70 text-xs font-semibold">Step {q.current_step + 1}</div>
                      <div>
                        {isDue ? (
                          <span className="px-2 py-0.5 bg-green-500/15 text-green-400 text-xs font-semibold rounded-full">Due now</span>
                        ) : (
                          <span className="text-white/50 text-xs">{formatDateTime(q.next_send_at)}</span>
                        )}
                      </div>
                      <div className={`text-xs font-medium capitalize ${CRM_COLORS[q.crm_status ?? ""] ?? "text-white/30"}`}>
                        {(q.crm_status ?? "—").replace(/_/g, " ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-white/25">
                <div className="text-3xl mb-3">📭</div>
                <p>No upcoming sends in queue</p>
              </div>
            )}
          </div>
        )
      )}

      {/* ── TAB: LEADS ──────────────────────────────────────────────────────── */}
      {tab === "leads" && (
        <div className="space-y-4">
          {/* Add leads from list */}
          <div className="bg-white/3 border border-white/6 rounded-xl p-4 flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Add Leads from List</label>
              <select
                value={addListId}
                onChange={e => setAddListId(e.target.value)}
                className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
              >
                <option value="">— select a list —</option>
                {lists.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.lead_count ?? "?"} leads)</option>
                ))}
              </select>
            </div>
            <button
              disabled={!addListId || addingLeads}
              onClick={async () => {
                if (!addListId) return;
                setAddingLeads(true); setAddLeadsResult(null);
                const res = await enrollLeads(campaignId, [addListId]);
                setAddLeadsResult(`${res.enrolled} lead${res.enrolled !== 1 ? "s" : ""} enrolled`);
                setAddingLeads(false);
                setAddListId("");
                const [data, fresh] = await Promise.all([
                  getCampaignEnrollments(campaignId, leadsPage, LEADS_PAGE_SIZE, leadsStatus),
                  getCampaign(campaignId),
                ]);
                setLeadsData(data);
                setCampaign(fresh);
              }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
            >
              {addingLeads ? "Enrolling…" : "Enroll"}
            </button>
            {addLeadsResult && <span className="text-green-400 text-xs flex-shrink-0">{addLeadsResult}</span>}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {["all","active","completed","replied","bounced","unsubscribed"].map(s => (
                <button key={s} onClick={() => { setLeadsStatus(s); setLeadsPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${leadsStatus === s ? "bg-white/15 text-white" : "bg-white/5 text-white/40 hover:text-white/60"}`}>{s}</button>
              ))}
            </div>
            <input
              value={leadsSearch}
              onChange={e => setLeadsSearch(e.target.value)}
              placeholder="Search name / email…"
              className="ml-auto w-48 bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-orange-500/50"
            />
          </div>

          {/* Table */}
          {leadsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-white/4 rounded-xl animate-pulse" />)}</div>
          ) : !leadsData || !leadsData.enrollments || leadsData.enrollments.length === 0 ? (
            <div className="text-center py-16 text-white/25">
              <p className="text-3xl mb-3">👥</p>
              <p>No leads enrolled{leadsStatus !== "all" ? ` with status "${leadsStatus}"` : ""}.</p>
            </div>
          ) : (
            <>
              <div className="border border-white/8 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_40px] gap-3 px-5 py-2.5 bg-white/3 border-b border-white/6">
                  {["Lead", "Company", "Status", "Next Send", ""].map(h => (
                    <div key={h} className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">{h}</div>
                  ))}
                </div>
                {leadsData.enrollments
                  .filter(e => {
                    if (!leadsSearch) return true;
                    const q = leadsSearch.toLowerCase();
                    return (
                      e.lead?.email.toLowerCase().includes(q) ||
                      (e.lead?.first_name ?? "").toLowerCase().includes(q) ||
                      (e.lead?.last_name ?? "").toLowerCase().includes(q)
                    );
                  })
                  .map((e, i) => {
                    const name = [e.lead?.first_name, e.lead?.last_name].filter(Boolean).join(" ") || e.lead?.email || "—";
                    const statusColors: Record<string, string> = {
                      active:       "text-green-400 bg-green-500/15",
                      completed:    "text-orange-400 bg-orange-500/15",
                      replied:      "text-violet-400 bg-violet-500/15",
                      bounced:      "text-red-400 bg-red-500/15",
                      unsubscribed: "text-amber-400 bg-amber-500/15",
                      paused:       "text-white/40 bg-white/8",
                    };
                    return (
                      <div key={e.id} className={`grid grid-cols-[2fr_1fr_1fr_1fr_40px] gap-3 items-center px-5 py-3 border-b border-white/4 last:border-0 ${i % 2 === 1 ? "bg-white/1" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-white/80 text-sm font-medium truncate">{name}</p>
                          <p className="text-white/30 text-xs truncate">{e.lead?.email}</p>
                        </div>
                        <p className="text-white/50 text-sm truncate">{e.lead?.company ?? "—"}</p>
                        <div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[e.status] ?? "text-white/30 bg-white/6"}`}>{e.status}</span>
                        </div>
                        <p className="text-white/40 text-xs">
                          {e.next_send_at
                            ? new Date(e.next_send_at) <= new Date()
                              ? <span className="text-green-400 font-medium">Due now</span>
                              : new Date(e.next_send_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—"}
                        </p>
                        <div className="flex justify-end">
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove ${name} from this campaign?`)) return;
                              setUnenrolling(e.id);
                              await unenrollLead(campaignId, e.id);
                              setLeadsData(prev => prev ? { ...prev, enrollments: prev.enrollments.filter(x => x.id !== e.id), total: prev.total - 1 } : prev);
                              setUnenrolling(null);
                            }}
                            disabled={unenrolling === e.id}
                            title="Remove from campaign"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/4 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Pagination */}
              {leadsData.total > LEADS_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-white/30 text-xs">{leadsPage * LEADS_PAGE_SIZE + 1}–{Math.min((leadsPage + 1) * LEADS_PAGE_SIZE, leadsData.total)} of {leadsData.total.toLocaleString()}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setLeadsPage(p => Math.max(0, p - 1))} disabled={leadsPage === 0} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs font-medium rounded-lg transition-colors">← Prev</button>
                    <button onClick={() => setLeadsPage(p => p + 1)} disabled={(leadsPage + 1) * LEADS_PAGE_SIZE >= leadsData.total} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs font-medium rounded-lg transition-colors">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
