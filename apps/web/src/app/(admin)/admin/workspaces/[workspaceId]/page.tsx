"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Workspace {
  id: string; name: string; slug: string; owner_id: string; owner_email: string;
  plan_id: string; plan_status: string; lead_credits_balance: number;
  sends_this_month: number; max_monthly_sends: number; max_inboxes: number; max_seats: number;
  created_at: string; updated_at: string;
  stripe_customer_id: string | null; stripe_sub_id: string | null; billing_email: string | null;
  trial_ends_at: string | null;
}
interface CreditTx {
  id: string; amount: number; type: string; description: string; created_at: string;
}
interface Campaign {
  id: string; name: string; status: string; total_scraped: number; credits_used: number; created_at: string;
}
interface DomainInbox {
  id: string; email_address: string; status: string;
  label: string | null; first_name: string | null; last_name: string | null;
  daily_send_limit: number | null; warmup_enabled: boolean | null;
  warmup_target_daily: number | null; warmup_ramp_per_week: number | null;
  warmup_ends_at: string | null; send_window_start: string | null;
  send_window_end: string | null;
  smtp_host: string | null; smtp_port: number | null; smtp_user: string | null;
}
interface Domain {
  id: string; domain: string; status: string; mailbox_count: number;
  warmup_ends_at: string | null; error_message: string | null; created_at: string;
  dns_records: Record<string, string>[] | null;
  mailbox_prefixes: string[] | null;
  first_name: string | null; last_name: string | null;
  redirect_url: string | null; reply_forward_to: string | null;
  forward_verified: boolean;
  inboxes: DomainInbox[];
}

const PLANS = ["free", "starter", "growth", "scale"] as const;
const PLAN_STATUSES = ["active", "trialing", "past_due", "canceled", "paused"] as const;

const STATUS_COLORS: Record<string, string> = {
  active:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  dns_pending:  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  verifying:    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  failed:       "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    growth:  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

function TxBadge({ type }: { type: string }) {
  if (type.includes("grant"))   return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">{type}</span>;
  if (type.includes("deduct") || type.includes("used")) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">{type}</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40">{type}</span>;
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [credits, setCredits]     = useState<CreditTx[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [domains, setDomains]     = useState<Domain[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [campaignPage, setCampaignPage] = useState(0);
  const [txPage, setTxPage]             = useState(0);
  const PAGE_SIZE = 10;

  // Plan change state
  const [planForm, setPlanForm]   = useState({ plan_id: "", plan_status: "active" });
  const [planLoading, setPlanLoading] = useState(false);
  const [planMsg, setPlanMsg]     = useState<string | null>(null);

  // Credit adjustment state
  const [creditForm, setCreditForm] = useState({ amount: "", description: "" });
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);

  // Domain management state
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [domainForm, setDomainForm] = useState({
    domain: "", mailbox_prefixes: "outreach1, outreach2", first_name: "", last_name: "",
  });
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainMsg, setDomainMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingDns, setPendingDns]       = useState<{ domain_record_id: string; dns_records: Record<string, string>[]; domain: string } | null>(null);
  const [verifyingId, setVerifyingId]     = useState<string | null>(null);
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [deletingDomainId, setDeletingDomainId] = useState<string | null>(null);

  // Add inboxes to existing domain
  const [addInboxesDomainId, setAddInboxesDomainId] = useState<string | null>(null);
  const [addInboxesPrefixes, setAddInboxesPrefixes] = useState("");
  const [addInboxesLoading, setAddInboxesLoading]   = useState(false);
  const [addInboxesMsg, setAddInboxesMsg]           = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Retry provision for failed domains
  const [retryingDomainId, setRetryingDomainId] = useState<string | null>(null);

  // Domain settings editing
  const [domainSettingsId, setDomainSettingsId]   = useState<string | null>(null);
  const [domainSettingsForm, setDomainSettingsForm] = useState({ redirect_url: "", reply_forward_to: "", first_name: "", last_name: "" });
  const [domainSettingsSaving, setDomainSettingsSaving] = useState(false);
  const [domainSettingsMsg, setDomainSettingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Per-inbox editing
  const [editingInboxId, setEditingInboxId]   = useState<string | null>(null);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [inboxEditForm, setInboxEditForm]     = useState<{
    label: string; first_name: string; last_name: string; daily_send_limit: string;
    warmup_enabled: boolean; warmup_target_daily: string;
    send_window_start: string; send_window_end: string;
  }>({ label: "", first_name: "", last_name: "", daily_send_limit: "30", warmup_enabled: true, warmup_target_daily: "30", send_window_start: "08:00", send_window_end: "18:00" });
  const [inboxEditSaving, setInboxEditSaving] = useState(false);
  const [inboxEditMsg, setInboxEditMsg]       = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [togglingInboxId, setTogglingInboxId] = useState<string | null>(null);
  const [deletingInboxId, setDeletingInboxId] = useState<string | null>(null);

  const fetchWorkspace = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/workspaces/${workspaceId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setWorkspace(d.workspace);
        setPlanForm({ plan_id: d.workspace.plan_id, plan_status: d.workspace.plan_status });
        setCredits(d.credits ?? []);
        setCampaigns(d.campaigns ?? []);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load workspace"); setLoading(false); });
  }, [workspaceId]);

  const fetchDomains = useCallback(() => {
    fetch(`/api/admin/workspaces/${workspaceId}/domains`)
      .then(r => r.json())
      .then(d => setDomains(d.domains ?? []));
  }, [workspaceId]);

  useEffect(() => { fetchWorkspace(); fetchDomains(); }, [fetchWorkspace, fetchDomains]);

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanLoading(true);
    setPlanMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_plan", ...planForm }),
    });
    const data = await res.json();
    setPlanLoading(false);
    if (data.ok) { setPlanMsg("Plan updated."); fetchWorkspace(); }
    else setPlanMsg(`Error: ${data.error}`);
  }

  async function adjustCredits(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(creditForm.amount);
    if (!amount) return;
    setCreditLoading(true);
    setCreditMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust_credits", amount, description: creditForm.description || undefined }),
    });
    const data = await res.json();
    setCreditLoading(false);
    if (data.ok) {
      setCreditMsg(`${amount > 0 ? "Granted" : "Deducted"} ${Math.abs(amount)} credits.`);
      setCreditForm({ amount: "", description: "" });
      fetchWorkspace();
    } else {
      setCreditMsg(`Error: ${data.error}`);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    setDomainMsg(null);
    setDomainLoading(true);
    const prefixes = domainForm.mailbox_prefixes.split(",").map(s => s.trim()).filter(Boolean);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain:           domainForm.domain.toLowerCase().trim(),
        mailbox_prefixes: prefixes,
        first_name:       domainForm.first_name || undefined,
        last_name:        domainForm.last_name  || undefined,
      }),
    });
    const data = await res.json() as { domain_record_id?: string; dns_records?: Record<string, string>[]; error?: string };
    setDomainLoading(false);
    if (!res.ok || data.error) { setDomainMsg({ type: "error", text: data.error ?? "Failed" }); return; }
    setPendingDns({ domain_record_id: data.domain_record_id!, dns_records: data.dns_records ?? [], domain: domainForm.domain });
    setShowAddDomain(false);
    setDomainForm({ domain: "", mailbox_prefixes: "outreach1, outreach2", first_name: "", last_name: "" });
    fetchDomains();
  }

  async function handleVerify(domainRecordId: string) {
    setVerifyingId(domainRecordId);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_record_id: domainRecordId }),
    });
    const data = await res.json() as { ok?: boolean; status?: string; inbox_count?: number; message?: string; error?: string };
    setVerifyingId(null);
    if (data.ok && data.status === "active") {
      setDomainMsg({ type: "success", text: `Domain verified! ${data.inbox_count} inbox(es) created.` });
      if (pendingDns?.domain_record_id === domainRecordId) setPendingDns(null);
    } else {
      setDomainMsg({ type: "error", text: data.message ?? data.error ?? "Verification failed" });
    }
    fetchDomains();
  }

  async function handleDeleteDomain(domainId: string, domainName: string) {
    if (!confirm(`Delete domain "${domainName}" and all its inboxes? This cannot be undone.`)) return;
    setDeletingDomainId(domainId);
    await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId }),
    });
    setDeletingDomainId(null);
    fetchDomains();
  }

  async function handleAdminAddInboxes(e: React.FormEvent) {
    e.preventDefault();
    if (!addInboxesDomainId) return;
    const prefixes = addInboxesPrefixes.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!prefixes.length) return;
    setAddInboxesLoading(true);
    setAddInboxesMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_inboxes", domain_record_id: addInboxesDomainId, new_prefixes: prefixes }),
    });
    const data = await res.json() as { ok?: boolean; count?: number; error?: string };
    setAddInboxesLoading(false);
    if (data.ok) {
      setAddInboxesMsg({ type: "success", text: `${data.count} inbox${(data.count ?? 0) !== 1 ? "es" : ""} created.` });
      setAddInboxesPrefixes("");
      fetchDomains();
    } else {
      setAddInboxesMsg({ type: "error", text: data.error ?? "Failed" });
    }
  }

  async function handleRetryProvision(domainId: string, domainName: string) {
    if (!confirm(`Retry full provision for "${domainName}"? This will re-purchase the domain and re-create inboxes.`)) return;
    setRetryingDomainId(domainId);
    setDomainMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_record_id: domainId, action: "retry_provision" }),
    });
    const data = await res.json() as { ok?: boolean; status?: string; error?: string };
    setRetryingDomainId(null);
    if (data.ok) {
      setDomainMsg({ type: "success", text: `Domain "${domainName}" provisioned successfully.` });
      fetchDomains();
    } else {
      setDomainMsg({ type: "error", text: data.error ?? "Retry failed" });
      fetchDomains();
    }
  }

  function openDomainSettings(domain: Domain) {
    setDomainSettingsId(domain.id);
    setDomainSettingsForm({
      redirect_url:     domain.redirect_url ?? "",
      reply_forward_to: domain.reply_forward_to ?? "",
      first_name:       domain.first_name ?? "",
      last_name:        domain.last_name  ?? "",
    });
    setDomainSettingsMsg(null);
    setExpandedDomainId(domain.id);
  }

  async function saveDomainSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!domainSettingsId) return;
    setDomainSettingsSaving(true);
    setDomainSettingsMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain_record_id: domainSettingsId,
        action: "update_domain_settings",
        redirect_url:     domainSettingsForm.redirect_url     || undefined,
        reply_forward_to: domainSettingsForm.reply_forward_to || undefined,
        first_name:       domainSettingsForm.first_name       || undefined,
        last_name:        domainSettingsForm.last_name        || undefined,
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setDomainSettingsSaving(false);
    if (data.ok) { setDomainSettingsMsg({ type: "success", text: "Settings saved." }); fetchDomains(); }
    else setDomainSettingsMsg({ type: "error", text: data.error ?? "Failed" });
  }

  function openInboxEdit(inbox: DomainInbox, domainId: string) {
    setEditingInboxId(inbox.id);
    setEditingDomainId(domainId);
    setInboxEditForm({
      label:                inbox.label          ?? inbox.email_address,
      first_name:           inbox.first_name     ?? "",
      last_name:            inbox.last_name      ?? "",
      daily_send_limit:     String(inbox.daily_send_limit     ?? 30),
      warmup_enabled:       inbox.warmup_enabled ?? true,
      warmup_target_daily:  String(inbox.warmup_target_daily  ?? 30),
      send_window_start:    inbox.send_window_start ?? "08:00",
      send_window_end:      inbox.send_window_end   ?? "18:00",
    });
    setInboxEditMsg(null);
  }

  async function saveInboxEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingInboxId || !editingDomainId) return;
    setInboxEditSaving(true);
    setInboxEditMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain_record_id:     editingDomainId,
        action:               "update_inbox",
        inbox_id:             editingInboxId,
        label:                inboxEditForm.label           || undefined,
        first_name:           inboxEditForm.first_name      || undefined,
        last_name:            inboxEditForm.last_name       || undefined,
        daily_send_limit:     parseInt(inboxEditForm.daily_send_limit)     || 30,
        warmup_enabled:       inboxEditForm.warmup_enabled,
        warmup_target_daily:  parseInt(inboxEditForm.warmup_target_daily)  || 30,
        send_window_start:    inboxEditForm.send_window_start || undefined,
        send_window_end:      inboxEditForm.send_window_end   || undefined,
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setInboxEditSaving(false);
    if (data.ok) {
      setInboxEditMsg({ type: "success", text: "Inbox updated." });
      fetchDomains();
    } else {
      setInboxEditMsg({ type: "error", text: data.error ?? "Failed" });
    }
  }

  async function handleToggleInbox(domainId: string, inboxId: string) {
    setTogglingInboxId(inboxId);
    await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_record_id: domainId, action: "toggle_inbox", inbox_id: inboxId }),
    });
    setTogglingInboxId(null);
    fetchDomains();
  }

  async function handleDeleteInbox(domainId: string, inboxId: string, email: string) {
    if (!confirm(`Delete inbox "${email}"? This will stop all campaigns using it.`)) return;
    setDeletingInboxId(inboxId);
    await fetch(`/api/admin/workspaces/${workspaceId}/domains`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_record_id: domainId, action: "delete_inbox", inbox_id: inboxId }),
    });
    setDeletingInboxId(null);
    fetchDomains();
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="h-36 bg-slate-200 dark:bg-white/10 rounded-xl" />
        <div className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-red-500">{error ?? "Workspace not found"}</p>
        <Link href="/admin/workspaces" className="text-sm text-orange-500 hover:underline mt-2 block">← Back to workspaces</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-white/30">
        <Link href="/admin/workspaces" className="hover:text-orange-500 transition-colors">Workspaces</Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-white/70">{workspace.name}</span>
      </div>

      {/* Overview card */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{workspace.name}</h1>
            <p className="text-sm text-slate-400 dark:text-white/40">{workspace.slug}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PlanBadge plan={workspace.plan_id} />
              <span className="text-[10px] text-slate-400 dark:text-white/30">ID: {workspace.id}</span>
            </div>
          </div>
          <Link
            href={`/admin/users/${workspace.owner_id}`}
            className="text-sm text-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            Owner: {workspace.owner_email} →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Credits", value: workspace.lead_credits_balance.toLocaleString() },
            { label: "Sends this month", value: `${workspace.sends_this_month.toLocaleString()} / ${workspace.max_monthly_sends.toLocaleString()}` },
            { label: "Max inboxes", value: String(workspace.max_inboxes) },
            { label: "Max seats", value: String(workspace.max_seats) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 dark:bg-white/5 rounded-lg px-4 py-3">
              <p className="text-[11px] text-slate-400 dark:text-white/30 uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white/80 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {(workspace.stripe_customer_id || workspace.billing_email) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10 grid grid-cols-2 gap-4 text-xs text-slate-500 dark:text-white/40">
            {workspace.stripe_customer_id && <p>Stripe customer: <span className="font-mono">{workspace.stripe_customer_id}</span></p>}
            {workspace.stripe_sub_id && <p>Stripe sub: <span className="font-mono">{workspace.stripe_sub_id}</span></p>}
            {workspace.billing_email && <p>Billing email: {workspace.billing_email}</p>}
            {workspace.trial_ends_at && <p>Trial ends: {new Date(workspace.trial_ends_at).toLocaleDateString()}</p>}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Change plan */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-4">Change Plan</h2>
          <form onSubmit={savePlan} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Plan</label>
              <select
                value={planForm.plan_id}
                onChange={e => setPlanForm(f => ({ ...f, plan_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Status</label>
              <select
                value={planForm.plan_status}
                onChange={e => setPlanForm(f => ({ ...f, plan_status: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {PLAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {planMsg && (
              <p className={`text-xs font-medium ${planMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {planMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={planLoading}
              className="w-full py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
            >
              {planLoading ? "Saving…" : "Save Plan"}
            </button>
          </form>
        </div>

        {/* Adjust credits */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-1">Adjust Credits</h2>
          <p className="text-xs text-slate-400 dark:text-white/30 mb-4">
            Current balance: <strong className="text-slate-700 dark:text-white/70">{workspace.lead_credits_balance.toLocaleString()}</strong>
          </p>
          <form onSubmit={adjustCredits} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Amount (negative to deduct)</label>
              <input
                type="number"
                value={creditForm.amount}
                onChange={e => setCreditForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 500 or -100"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Description (optional)</label>
              <input
                type="text"
                value={creditForm.description}
                onChange={e => setCreditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Promotional grant"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            {creditMsg && (
              <p className={`text-xs font-medium ${creditMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {creditMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={creditLoading || !creditForm.amount}
              className="w-full py-2 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
            >
              {creditLoading ? "Applying…" : "Apply Adjustment"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Domain management ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Sending Domains</h2>
            <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{domains.length} domain{domains.length !== 1 ? "s" : ""} configured</p>
          </div>
          <button
            onClick={() => { setShowAddDomain(v => !v); setDomainMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Domain
          </button>
        </div>

        {/* Global domain message */}
        {domainMsg && (
          <div className={`mx-5 mt-4 px-4 py-2.5 rounded-lg text-xs font-medium ${domainMsg.type === "success" ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"}`}>
            {domainMsg.text}
          </div>
        )}

        {/* Add domain form */}
        {showAddDomain && (
          <div className="p-5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/3">
            <form onSubmit={handleAddDomain} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1">Domain</label>
                  <input
                    value={domainForm.domain}
                    onChange={e => setDomainForm(f => ({ ...f, domain: e.target.value }))}
                    placeholder="e.g. send.company.com"
                    required
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1">Mailbox Prefixes (comma-separated)</label>
                  <input
                    value={domainForm.mailbox_prefixes}
                    onChange={e => setDomainForm(f => ({ ...f, mailbox_prefixes: e.target.value }))}
                    placeholder="outreach1, outreach2"
                    required
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1">Sender First Name (optional)</label>
                  <input
                    value={domainForm.first_name}
                    onChange={e => setDomainForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="e.g. Alex"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1">Sender Last Name (optional)</label>
                  <input
                    value={domainForm.last_name}
                    onChange={e => setDomainForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="e.g. Johnson"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={domainLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
                >
                  {domainLoading ? "Connecting…" : "Connect Domain"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDomain(false)}
                  className="px-4 py-2 text-sm text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Pending DNS records panel */}
        {pendingDns && (
          <div className="p-5 border-b border-slate-100 dark:border-white/10 bg-amber-50 dark:bg-amber-500/5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">DNS records for {pendingDns.domain}</p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">Add these records to your DNS provider, then click Verify.</p>
              </div>
              <button
                onClick={() => handleVerify(pendingDns.domain_record_id)}
                disabled={verifyingId === pendingDns.domain_record_id}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-50"
              >
                {verifyingId === pendingDns.domain_record_id ? "Checking…" : "Verify DNS"}
              </button>
            </div>
            <div className="space-y-2">
              {(pendingDns.dns_records ?? []).map((rec, i) => (
                <div key={i} className="bg-white dark:bg-white/5 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 text-xs font-mono">
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(rec).map(([k, v]) => (
                      <span key={k}><span className="text-slate-400 dark:text-white/30">{k}:</span> <span className="text-slate-700 dark:text-white/70 select-all">{v}</span></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Domain list */}
        {domains.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-slate-400 dark:text-white/30">No sending domains configured for this workspace</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {domains.map(domain => (
              <div key={domain.id}>
                <div
                  className="px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/3 transition-colors"
                  onClick={() => setExpandedDomainId(v => v === domain.id ? null : domain.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white/80">{domain.domain}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[domain.status] ?? STATUS_COLORS.dns_pending}`}>
                        {domain.status.replace("_", " ")}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-white/30">{domain.inboxes.length} inbox{domain.inboxes.length !== 1 ? "es" : ""}</span>
                    </div>
                    {domain.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">{domain.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(domain.status === "dns_pending" || domain.status === "verifying") && (
                      <button
                        onClick={e => { e.stopPropagation(); handleVerify(domain.id); }}
                        disabled={verifyingId === domain.id}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {verifyingId === domain.id ? "Checking…" : "Verify DNS"}
                      </button>
                    )}
                    {(domain.status === "failed" || (domain.status === "dns_pending" && domain.inboxes.length === 0)) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRetryProvision(domain.id, domain.domain); }}
                        disabled={retryingDomainId === domain.id}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors disabled:opacity-50"
                      >
                        {retryingDomainId === domain.id ? "Retrying…" : "Retry Provision"}
                      </button>
                    )}
                    {domain.status === "active" && (
                      <button
                        onClick={e => { e.stopPropagation(); openDomainSettings(domain); }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 text-slate-500 dark:text-white/50 transition-colors"
                      >
                        Settings
                      </button>
                    )}
                    {domain.status === "active" && domain.inboxes.length < 5 && (
                      <button
                        onClick={e => { e.stopPropagation(); setAddInboxesDomainId(domain.id); setAddInboxesPrefixes(""); setAddInboxesMsg(null); setExpandedDomainId(domain.id); }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 dark:text-orange-400 transition-colors"
                      >
                        + Inbox
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteDomain(domain.id, domain.domain); }}
                      disabled={deletingDomainId === domain.id}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors disabled:opacity-50"
                    >
                      {deletingDomainId === domain.id ? "…" : "Delete"}
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform ${expandedDomainId === domain.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded panel */}
                {expandedDomainId === domain.id && (
                  <div className="border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/3 divide-y divide-slate-100 dark:divide-white/5">

                    {/* ── Domain Settings ───────────────────────────────────── */}
                    {domainSettingsId === domain.id && (
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/40 mb-3">Domain Settings</p>
                        <form onSubmit={saveDomainSettings} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] text-slate-400 dark:text-white/40 block mb-1">Web redirect URL</label>
                              <input type="url" value={domainSettingsForm.redirect_url} onChange={e => setDomainSettingsForm(f => ({ ...f, redirect_url: e.target.value }))} placeholder="https://yoursite.com"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-400 dark:text-white/40 block mb-1">Forward all replies to</label>
                              <input type="email" value={domainSettingsForm.reply_forward_to} onChange={e => setDomainSettingsForm(f => ({ ...f, reply_forward_to: e.target.value }))} placeholder="you@company.com"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                              {domain.reply_forward_to && !domain.forward_verified && (
                                <p className="text-[10px] text-amber-500 mt-0.5">⚠ Pending Cloudflare verification</p>
                              )}
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-400 dark:text-white/40 block mb-1">Sender first name</label>
                              <input type="text" value={domainSettingsForm.first_name} onChange={e => setDomainSettingsForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Alex"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-400 dark:text-white/40 block mb-1">Sender last name</label>
                              <input type="text" value={domainSettingsForm.last_name} onChange={e => setDomainSettingsForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Johnson"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                            </div>
                          </div>
                          {domainSettingsMsg && (
                            <p className={`text-xs font-medium ${domainSettingsMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{domainSettingsMsg.text}</p>
                          )}
                          <div className="flex gap-2">
                            <button type="submit" disabled={domainSettingsSaving} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50">
                              {domainSettingsSaving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setDomainSettingsId(null)} className="px-3 py-1.5 text-xs text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 transition-colors">Cancel</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* ── Inboxes ───────────────────────────────────────────── */}
                    {domain.inboxes.length > 0 && (
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-3">Inboxes</p>
                        <div className="space-y-2">
                          {domain.inboxes.map(inbox => (
                            <div key={inbox.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                              {/* Inbox header row */}
                              <div className="flex items-center gap-3 px-3 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-mono text-slate-700 dark:text-white/70 truncate">{inbox.email_address}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${inbox.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40"}`}>
                                      {inbox.status}
                                    </span>
                                    {inbox.warmup_ends_at && new Date(inbox.warmup_ends_at) > new Date() && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">Warmup</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                    {(inbox.first_name || inbox.last_name) && (
                                      <span className="text-[10px] text-slate-400 dark:text-white/30">{[inbox.first_name, inbox.last_name].filter(Boolean).join(" ")}</span>
                                    )}
                                    <span className="text-[10px] text-slate-400 dark:text-white/30">{inbox.daily_send_limit ?? 30}/day</span>
                                    {inbox.send_window_start && <span className="text-[10px] text-slate-400 dark:text-white/30">{inbox.send_window_start}–{inbox.send_window_end}</span>}
                                    {inbox.smtp_user && <span className="text-[10px] font-mono text-slate-300 dark:text-white/20 truncate max-w-[120px]">{inbox.smtp_user}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() => editingInboxId === inbox.id ? setEditingInboxId(null) : openInboxEdit(inbox, domain.id)}
                                    className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 text-slate-500 dark:text-white/50 transition-colors"
                                  >
                                    {editingInboxId === inbox.id ? "Close" : "Edit"}
                                  </button>
                                  <button
                                    onClick={() => handleToggleInbox(domain.id, inbox.id)}
                                    disabled={togglingInboxId === inbox.id}
                                    className={`px-2 py-1 text-[10px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${inbox.status === "active" ? "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/25" : "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/25"}`}
                                  >
                                    {togglingInboxId === inbox.id ? "…" : inbox.status === "active" ? "Pause" : "Activate"}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInbox(domain.id, inbox.id, inbox.email_address)}
                                    disabled={deletingInboxId === inbox.id}
                                    className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-500 transition-colors disabled:opacity-50"
                                  >
                                    {deletingInboxId === inbox.id ? "…" : "Delete"}
                                  </button>
                                </div>
                              </div>

                              {/* Inline edit form */}
                              {editingInboxId === inbox.id && (
                                <form onSubmit={saveInboxEdit} className="border-t border-slate-100 dark:border-white/8 px-3 py-3 bg-slate-50 dark:bg-white/3 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div className="col-span-2 sm:col-span-3">
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Label</label>
                                      <input type="text" value={inboxEditForm.label} onChange={e => setInboxEditForm(f => ({ ...f, label: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">First name</label>
                                      <input type="text" value={inboxEditForm.first_name} onChange={e => setInboxEditForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Alex"
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Last name</label>
                                      <input type="text" value={inboxEditForm.last_name} onChange={e => setInboxEditForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Johnson"
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Daily limit</label>
                                      <input type="number" min={1} max={500} value={inboxEditForm.daily_send_limit} onChange={e => setInboxEditForm(f => ({ ...f, daily_send_limit: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Warmup target/day</label>
                                      <input type="number" min={1} value={inboxEditForm.warmup_target_daily} onChange={e => setInboxEditForm(f => ({ ...f, warmup_target_daily: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Send window start</label>
                                      <input type="time" value={inboxEditForm.send_window_start} onChange={e => setInboxEditForm(f => ({ ...f, send_window_start: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 dark:text-white/40 block mb-1">Send window end</label>
                                      <input type="time" value={inboxEditForm.send_window_end} onChange={e => setInboxEditForm(f => ({ ...f, send_window_end: e.target.value }))}
                                        className="w-full px-2 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-orange-500/30" />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/50 cursor-pointer">
                                      <input type="checkbox" checked={inboxEditForm.warmup_enabled} onChange={e => setInboxEditForm(f => ({ ...f, warmup_enabled: e.target.checked }))}
                                        className="rounded border-slate-300 dark:border-white/20 text-orange-500 focus:ring-orange-500/30" />
                                      Warmup enabled
                                    </label>
                                  </div>
                                  {inboxEditMsg && (
                                    <p className={`text-xs font-medium ${inboxEditMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{inboxEditMsg.text}</p>
                                  )}
                                  <div className="flex gap-2">
                                    <button type="submit" disabled={inboxEditSaving} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50">
                                      {inboxEditSaving ? "Saving…" : "Save changes"}
                                    </button>
                                    <button type="button" onClick={() => { setEditingInboxId(null); setInboxEditMsg(null); }} className="px-3 py-1.5 text-xs text-slate-500 dark:text-white/40 hover:text-slate-700 transition-colors">Cancel</button>
                                  </div>
                                </form>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Add Inboxes form ──────────────────────────────────── */}
                    {addInboxesDomainId === domain.id && (
                      <div className="px-5 py-4">
                        <form onSubmit={handleAdminAddInboxes} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-500 dark:text-orange-400 mb-2">Add Inboxes</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={addInboxesPrefixes}
                              onChange={e => setAddInboxesPrefixes(e.target.value)}
                              placeholder="e.g. sarah, mike"
                              className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                            />
                            <button type="submit" disabled={addInboxesLoading || !addInboxesPrefixes.trim()}
                              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50">
                              {addInboxesLoading ? "Creating…" : "Create"}
                            </button>
                            <button type="button" onClick={() => { setAddInboxesDomainId(null); setAddInboxesMsg(null); }}
                              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/50 transition-colors">
                              Cancel
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-white/30">Comma-separated prefixes. No payment required.</p>
                          {addInboxesMsg && (
                            <p className={`text-xs font-medium ${addInboxesMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{addInboxesMsg.text}</p>
                          )}
                        </form>
                      </div>
                    )}

                    {/* ── DNS Records ───────────────────────────────────────── */}
                    {domain.dns_records && domain.dns_records.length > 0 && (
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30 mb-2">DNS Records</p>
                        <div className="space-y-1.5">
                          {domain.dns_records.map((rec, i) => (
                            <div key={i} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-xs font-mono">
                              <div className="flex gap-3 flex-wrap">
                                {Object.entries(rec).map(([k, v]) => (
                                  <span key={k}><span className="text-slate-400 dark:text-white/30">{k}:</span> <span className="text-slate-700 dark:text-white/70 select-all">{v}</span></span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Meta ──────────────────────────────────────────────── */}
                    <div className="px-5 py-3 text-xs text-slate-400 dark:text-white/25">
                      Added {new Date(domain.created_at).toLocaleDateString()}
                      {domain.warmup_ends_at && ` · Warmup ends ${new Date(domain.warmup_ends_at).toLocaleDateString()}`}
                      {domain.redirect_url && ` · Redirects → ${domain.redirect_url}`}
                      {domain.reply_forward_to && ` · Forwards to ${domain.reply_forward_to}`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tables row — 2 columns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Campaigns */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Lead Campaigns</h2>
            <span className="text-xs text-slate-400 dark:text-white/30">{campaigns.length} total</span>
          </div>
          {campaigns.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400 dark:text-white/30">No campaigns yet</p>
          ) : (
            <>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      {["Name", "Status", "Leads", "Credits", "Date"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {campaigns.slice(campaignPage * PAGE_SIZE, (campaignPage + 1) * PAGE_SIZE).map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-slate-800 dark:text-white/80 font-medium max-w-[120px] truncate">{c.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50">{c.status}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-white/60">{(c.total_scraped ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40 text-xs">{(c.credits_used ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-white/40 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {campaigns.length > PAGE_SIZE && (
                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
                  <span>{campaignPage * PAGE_SIZE + 1}–{Math.min((campaignPage + 1) * PAGE_SIZE, campaigns.length)} of {campaigns.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setCampaignPage(p => Math.max(0, p - 1))} disabled={campaignPage === 0} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                    <button onClick={() => setCampaignPage(p => p + 1)} disabled={(campaignPage + 1) * PAGE_SIZE >= campaigns.length} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Credit transaction log */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Credit Transactions</h2>
            <span className="text-xs text-slate-400 dark:text-white/30">{credits.length} total</span>
          </div>
          {credits.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400 dark:text-white/30">No transactions yet</p>
          ) : (
            <>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      {["Type", "Amount", "Description", "Date"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {credits.slice(txPage * PAGE_SIZE, (txPage + 1) * PAGE_SIZE).map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3"><TxBadge type={tx.type} /></td>
                        <td className={`px-4 py-3 tabular-nums font-semibold text-sm ${tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-white/50 text-xs max-w-[100px] truncate">{tx.description}</td>
                        <td className="px-4 py-3 text-slate-400 dark:text-white/30 text-xs">{new Date(tx.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {credits.length > PAGE_SIZE && (
                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
                  <span>{txPage * PAGE_SIZE + 1}–{Math.min((txPage + 1) * PAGE_SIZE, credits.length)} of {credits.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setTxPage(p => Math.max(0, p - 1))} disabled={txPage === 0} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                    <button onClick={() => setTxPage(p => p + 1)} disabled={(txPage + 1) * PAGE_SIZE >= credits.length} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>

    </div>
  );
}
