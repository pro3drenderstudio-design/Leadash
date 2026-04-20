"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getInboxes, deleteInbox, updateInbox, importInboxes } from "@/lib/outreach/api";
import { wsFetch } from "@/lib/workspace/client";
import type { OutreachInboxSafe, ImportResult as InboxImportResult } from "@/types/outreach";

// ─── Domain types ─────────────────────────────────────────────────────────────
interface OutreachDomain {
  id: string;
  domain: string;
  status: string;
  mailbox_count: number;
  inbox_count: number;
  mailbox_prefixes: string[] | null;
  warmup_ends_at: string | null;
  error_message: string | null;
  created_at: string;
  redirect_url: string | null;
  reply_forward_to: string | null;
  forward_verified: boolean;
}

// ─── CSV column mapping ────────────────────────────────────────────────────────

const INBOX_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "email",            label: "Email address",     required: true  },
  { key: "smtp_host",        label: "SMTP host",         required: true  },
  { key: "smtp_user",        label: "SMTP username",     required: true  },
  { key: "smtp_pass",        label: "SMTP password",     required: true  },
  { key: "label",            label: "Label / name",      required: false },
  { key: "smtp_port",        label: "SMTP port",         required: false },
  { key: "imap_host",        label: "IMAP host",         required: false },
  { key: "imap_port",        label: "IMAP port",         required: false },
  { key: "daily_limit",      label: "Daily send limit",  required: false },
  { key: "timezone",         label: "Timezone",          required: false },
  { key: "send_window_start",label: "Send window start", required: false },
  { key: "send_window_end",  label: "Send window end",   required: false },
  { key: "warmup_target",    label: "Warmup target",     required: false },
];

function parseCsvHeaders(text: string): string[] {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

function autoMap(headers: string[]): Record<string, string> {
  const normalized = headers.map((h) => h.toLowerCase().replace(/[\s\-]/g, "_"));
  const mapping: Record<string, string> = {};
  for (const field of INBOX_FIELDS) {
    const aliases: Record<string, string[]> = {
      email:             ["email", "email_address", "from_email"],
      smtp_host:         ["smtp_host", "smtp_server", "mail_server"],
      smtp_user:         ["smtp_user", "smtp_username", "username", "user"],
      smtp_pass:         ["smtp_pass", "smtp_password", "password", "pass", "app_password"],
      label:             ["label", "name", "inbox_name"],
      smtp_port:         ["smtp_port", "port"],
      imap_host:         ["imap_host", "imap_server"],
      imap_port:         ["imap_port"],
      daily_limit:       ["daily_limit", "daily_send_limit", "limit"],
      timezone:          ["timezone", "time_zone", "tz"],
      send_window_start: ["send_window_start", "window_start", "start_time"],
      send_window_end:   ["send_window_end",   "window_end",   "end_time"],
      warmup_target:     ["warmup_target", "warmup_target_daily"],
    };
    const candidates = aliases[field.key] ?? [field.key];
    const match = normalized.findIndex((n) => candidates.includes(n));
    if (match !== -1) mapping[field.key] = headers[match];
  }
  return mapping;
}

function remapCsv(text: string, mapping: Record<string, string>): string {
  const lines = text.split("\n").filter(Boolean);
  if (!lines.length) return text;
  const originalHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  // Build new header row using our standard keys
  const newHeaders = INBOX_FIELDS.map((f) => f.key);
  const headerLine = newHeaders.join(",");
  const dataLines = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return newHeaders.map((key) => {
      const srcCol = mapping[key];
      if (!srcCol) return "";
      const idx = originalHeaders.indexOf(srcCol);
      return idx !== -1 ? (cells[idx] ?? "") : "";
    }).join(",");
  });
  return [headerLine, ...dataLines].join("\n");
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

const CSV_TEMPLATE_HEADERS = "email,smtp_host,smtp_user,smtp_pass,label,smtp_port,imap_host,imap_port,daily_limit,timezone,send_window_start,send_window_end,warmup_target";
const CSV_TEMPLATE_ROWS = [
  // Gmail — use an App Password (myaccount.google.com/apppasswords) with 2FA enabled
  "you@gmail.com,smtp.gmail.com,you@gmail.com,your-app-password,My Gmail,587,imap.gmail.com,993,50,America/New_York,09:00,17:00,50",
  // Outlook / Microsoft 365 — use an App Password or OAuth; SMTP AUTH must be enabled
  "you@outlook.com,smtp-mail.outlook.com,you@outlook.com,your-app-password,My Outlook,587,outlook.office365.com,993,50,America/New_York,09:00,17:00,50",
  // Custom domain SMTP — fill in your mail server details
  "you@yourdomain.com,mail.yourdomain.com,you@yourdomain.com,your-password,Custom SMTP,587,mail.yourdomain.com,993,80,America/New_York,08:00,18:00,80",
].join("\n");

function downloadTemplate() {
  const content = `${CSV_TEMPLATE_HEADERS}\n${CSV_TEMPLATE_ROWS}\n`;
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "inboxes-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

const PROVIDER_COLORS: Record<string, string> = {
  gmail:   "#ef4444",
  outlook: "#3b82f6",
  smtp:    "#a855f7",
};

// ─── Profile image avatar ─────────────────────────────────────────────────────
function InboxAvatar({
  inbox, size = 36, onUploaded,
}: {
  inbox: OutreachInboxSafe;
  size?: number;
  onUploaded?: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(inbox.profile_image_url ?? null);
  const color = PROVIDER_COLORS[inbox.provider] ?? "#888";
  const initials = ((inbox.first_name?.[0] ?? "") + (inbox.last_name?.[0] ?? "")) ||
    inbox.email_address.slice(0, 2).toUpperCase();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("inbox_id", inbox.id);
    try {
      const { wsFetch } = await import("@/lib/workspace/client");
      const res  = await wsFetch("/api/outreach/inboxes/profile-image", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) { setPreview(data.url); onUploaded?.(data.url); }
    } finally { setUploading(false); e.target.value = ""; }
  }

  return (
    <div className="relative flex-shrink-0 group" style={{ width: size, height: size }}>
      {preview ? (
        <img src={preview} alt="" className="w-full h-full rounded-lg object-cover" style={{ width: size, height: size }} />
      ) : (
        <div className="w-full h-full rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ background: `${color}20`, border: `1px solid ${color}40`, color, fontSize: size < 32 ? 9 : 11 }}>
          {initials}
        </div>
      )}
      {/* Upload overlay on hover */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        title="Upload photo"
      >
        {uploading ? (
          <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} />
    </div>
  );
}

interface InboxesClientProps {
  trialExpired?: boolean;
  planId?: string;
  maxInboxes?: number;
}

export default function InboxesClient({ trialExpired = false, planId = "free", maxInboxes = 5 }: InboxesClientProps) {
  const params = useSearchParams();
  const [activeTab, setActiveTab]       = useState<"inboxes" | "domains">("inboxes");
  const [inboxes, setInboxes]           = useState<OutreachInboxSafe[]>([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState<string | null>(null);
  const [domains, setDomains]           = useState<OutreachDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [reconfiguringId, setReconfiguringId] = useState<string | null>(null);
  const [reconfiguringStep, setReconfiguringStep] = useState<string>("");
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [showImport, setShowImport]     = useState(false);
  const [importFile, setImportFile]     = useState<File | null>(null);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<InboxImportResult | null>(null);
  const [importError, setImportError]   = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([]);
  const [colMapping, setColMapping]     = useState<Record<string, string>>({});
  const [showMapping, setShowMapping]   = useState(false);
  const [page, setPage]                 = useState(0);

  const PAGE_SIZE = 10;

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected]   = useState(false); // true = every inbox selected
  const [bulkWorking, setBulkWorking]   = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkFields, setBulkFields]     = useState({
    first_name: "", last_name: "",
    daily_send_limit: "", send_window_start: "", send_window_end: "",
    timezone: "", status: "" as "" | "active" | "paused",
    warmup_enabled: "" as "" | "true" | "false",
    warmup_target_daily: "", warmup_ramp_per_week: "",
  });

  // ── Domain settings modal ─────────────────────────────────────────────────
  const [settingsDomain, setSettingsDomain]   = useState<OutreachDomain | null>(null);
  const [settingsRedirect, setSettingsRedirect] = useState("");
  const [settingsForward, setSettingsForward]   = useState("");
  const [settingsSaving, setSettingsSaving]     = useState(false);
  const [settingsMsg, setSettingsMsg]           = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Add inboxes modal ─────────────────────────────────────────────────────
  const [addInboxesDomain, setAddInboxesDomain] = useState<OutreachDomain | null>(null);
  const [addPrefixes, setAddPrefixes]           = useState("");
  const [addWorking, setAddWorking]             = useState(false);
  const [addMsg, setAddMsg]                     = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Inbox drawer ──────────────────────────────────────────────────────────
  const [drawerInbox, setDrawerInbox]   = useState<OutreachInboxSafe | null>(null);
  const [drawerEdits, setDrawerEdits]   = useState<Partial<OutreachInboxSafe>>({});
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [delivResult, setDelivResult]     = useState<string | null>(null);
  const [delivTesting, setDelivTesting]   = useState(false);
  const [delivRecipient, setDelivRecipient] = useState("");

  const pageInboxes = inboxes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const allPageSelected = pageInboxes.length > 0 && pageInboxes.every((i) => selected.has(i.id));
  const effectiveCount  = allSelected ? inboxes.length : selected.size;

  function toggleSelect(id: string) {
    setAllSelected(false);
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setAllSelected(false);
    if (allPageSelected) {
      setSelected((s) => { const n = new Set(s); pageInboxes.forEach((i) => n.delete(i.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); pageInboxes.forEach((i) => n.add(i.id)); return n; });
    }
  }
  function selectAllInboxes() {
    setAllSelected(true);
    setSelected(new Set(inboxes.map((i) => i.id)));
  }
  function clearSelection() {
    setAllSelected(false);
    setSelected(new Set());
  }

  const targetIds = allSelected ? inboxes.map((i) => i.id) : [...selected];

  async function handleBulkDelete() {
    if (!confirm(`Delete ${effectiveCount} inbox${effectiveCount !== 1 ? "es" : ""}? This will stop all campaigns using them.`)) return;
    setBulkWorking(true);
    await Promise.all(targetIds.map((id) => deleteInbox(id)));
    clearSelection();
    setBulkWorking(false);
    load();
    showToast(`Deleted ${effectiveCount} inboxes`);
  }

  async function handleBulkStatusChange(status: "active" | "paused") {
    setBulkWorking(true);
    await Promise.all(targetIds.map((id) => updateInbox(id, { status })));
    clearSelection();
    setBulkWorking(false);
    load();
    showToast(`${effectiveCount} inboxes ${status === "active" ? "resumed" : "paused"}`);
  }

  async function handleBulkEdit() {
    const patch: Record<string, unknown> = {};
    if (bulkFields.first_name)          patch.first_name          = bulkFields.first_name;
    if (bulkFields.last_name)           patch.last_name           = bulkFields.last_name;
    if (bulkFields.daily_send_limit)    patch.daily_send_limit    = parseInt(bulkFields.daily_send_limit);
    if (bulkFields.send_window_start)   patch.send_window_start   = bulkFields.send_window_start;
    if (bulkFields.send_window_end)     patch.send_window_end     = bulkFields.send_window_end;
    if (bulkFields.timezone)            patch.timezone            = bulkFields.timezone;
    if (bulkFields.status)              patch.status              = bulkFields.status;
    if (bulkFields.warmup_enabled !== "") patch.warmup_enabled    = bulkFields.warmup_enabled === "true";
    if (bulkFields.warmup_target_daily)  patch.warmup_target_daily  = parseInt(bulkFields.warmup_target_daily);
    if (bulkFields.warmup_ramp_per_week) patch.warmup_ramp_per_week = parseInt(bulkFields.warmup_ramp_per_week);
    if (!Object.keys(patch).length) { setShowBulkEdit(false); return; }
    setBulkWorking(true);
    await Promise.all(targetIds.map((id) => updateInbox(id, patch)));
    clearSelection();
    setShowBulkEdit(false);
    setBulkFields({ first_name: "", last_name: "", daily_send_limit: "", send_window_start: "", send_window_end: "", timezone: "", status: "", warmup_enabled: "", warmup_target_daily: "", warmup_ramp_per_week: "" });
    setBulkWorking(false);
    load();
    showToast(`Updated ${effectiveCount} inboxes`);
  }

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const success = params.get("success");
    const error   = params.get("error");
    if (success === "gmail")         showToast("Gmail inbox connected successfully");
    if (success === "microsoft")     showToast("Microsoft inbox connected successfully");
    if (success === "admin_consent") showToast("Admin consent granted — you can now connect individual inboxes");
    if (error)                       showToast(`Error: ${decodeURIComponent(error)}`, true);

    // Post-payment: provision new inboxes added to an existing domain
    const addDomainId    = params.get("add_inboxes_domain");
    const prefixesB64    = params.get("prefixes");
    const sessionId      = params.get("session_id");
    const paystackRef    = params.get("reference") || params.get("trxref");
    if (addDomainId && prefixesB64) {
      const prefixes = Buffer.from(prefixesB64, "base64url").toString("utf-8").split(",").filter(Boolean);
      setActiveTab("domains");
      void (async () => {
        showToast("Payment received — provisioning new inboxes…");
        try {
          const res = await wsFetch(`/api/outreach/domains/${addDomainId}/add-inboxes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "provision",
              new_prefixes: prefixes,
              ...(sessionId      ? { stripe_session_id: sessionId } : {}),
              ...(paystackRef    ? { paystack_reference: paystackRef } : {}),
            }),
          });
          const d = await res.json();
          if (d.ok) {
            showToast(`${d.count} new inbox${d.count !== 1 ? "es" : ""} created`);
            loadDomains();
            load();
          } else {
            showToast(`Error: ${d.error ?? "Provisioning failed"}`);
          }
        } catch {
          showToast("Error: provisioning request failed");
        }
        // Clean up URL params
        const url = new URL(window.location.href);
        url.searchParams.delete("add_inboxes_domain");
        url.searchParams.delete("prefixes");
        url.searchParams.delete("session_id");
        url.searchParams.delete("reference");
        url.searchParams.delete("trxref");
        window.history.replaceState({}, "", url.toString());
      })();
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setInboxes(await getInboxes());
    } catch {
      // swallow — inboxes list just stays empty
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string, _isError = false) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function loadDomains() {
    setDomainsLoading(true);
    try {
      const res = await wsFetch("/api/outreach/domains");
      if (res.ok) {
        const loaded: OutreachDomain[] = await res.json();
        setDomains(loaded);
        // Auto-start polling for any domains already sitting at dns_pending
        for (const d of loaded) {
          if (d.status === "dns_pending") startDnsPolling(d.id, d.domain);
        }
      }
    } catch { /* swallow */ }
    finally { setDomainsLoading(false); }
  }

  useEffect(() => {
    if (activeTab === "domains" && domains.length === 0) loadDomains();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeleteDomain(domainId: string, domain: string) {
    if (!confirm(`Delete ${domain}? This will not remove any inboxes already created.`)) return;
    try {
      const res = await wsFetch("/api/outreach/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: domainId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      showToast("Domain record deleted");
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function startDnsPolling(domainId: string, domainName: string) {
    if (pollingRefs.current.has(domainId)) return;
    setPollingIds(prev => new Set(prev).add(domainId));

    const interval = setInterval(async () => {
      try {
        const res = await wsFetch(`/api/outreach/domains/${domainId}/status`);
        if (!res.ok) return;
        const d = await res.json();
        if (d.status === "active") {
          clearInterval(interval);
          pollingRefs.current.delete(domainId);
          setPollingIds(prev => { const s = new Set(prev); s.delete(domainId); return s; });
          setDomains(prev => prev.map(dom => dom.id === domainId ? { ...dom, status: "active", error_message: null } : dom));
          showToast(`${domainName} is now active`);
        }
      } catch { /* ignore */ }
    }, 20_000);

    pollingRefs.current.set(domainId, interval);

    // Give up after 48 hours (DNS propagation can take time)
    setTimeout(() => {
      if (pollingRefs.current.has(domainId)) {
        clearInterval(interval);
        pollingRefs.current.delete(domainId);
        setPollingIds(prev => { const s = new Set(prev); s.delete(domainId); return s; });
      }
    }, 172_800_000);
  }

  async function handleReconfigure(domainId: string) {
    setReconfiguringId(domainId);
    setReconfiguringStep("Registering with Postal…");
    try {
      setReconfiguringStep("Publishing DNS records…");
      const res = await wsFetch(`/api/outreach/domains/${domainId}/ses-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_cloudflare: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      setReconfiguringStep("Verifying DNS…");

      if (data.status === "active") {
        // Domain verified — ensure inboxes exist
        const connectRes = await wsFetch("/api/outreach/domains/connect", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain_record_id: domainId }),
        });
        const connectData = await connectRes.json();
        if (connectRes.ok && connectData.inbox_count > 0) {
          showToast(`Domain active — ${connectData.inbox_count} inbox${connectData.inbox_count !== 1 ? "es" : ""} ready`);
          loadDomains();
          load();
          return;
        }
        showToast("Domain active — DNS records updated");
        loadDomains();
        return;
      }

      // dns_pending — update row immediately and start background polling
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, status: "dns_pending", error_message: null } : d));
      const domainName = data.domain ?? domainId;
      showToast(data.auto_configured
        ? "DNS records published — waiting for propagation (usually 1–5 min)"
        : "DNS records updated — add them to your DNS provider then click Re-configure again"
      );
      startDnsPolling(domainId, domainName);
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
      loadDomains();
    } finally {
      setReconfiguringId(null);
      setReconfiguringStep("");
    }
  }

  function openSettings(d: OutreachDomain) {
    setSettingsDomain(d);
    setSettingsRedirect(d.redirect_url ?? "");
    setSettingsForward(d.reply_forward_to ?? "");
    setSettingsMsg(null);
  }

  async function handleSaveSettings() {
    if (!settingsDomain) return;
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const body: Record<string, string | null> = {};
      const newRedirect = settingsRedirect.trim() || null;
      const newForward  = settingsForward.trim()  || null;
      if (newRedirect !== settingsDomain.redirect_url)     body.redirect_url     = newRedirect;
      if (newForward  !== settingsDomain.reply_forward_to) body.reply_forward_to = newForward;
      if (!Object.keys(body).length) { setSettingsDomain(null); return; }

      const res  = await wsFetch(`/api/outreach/domains/${settingsDomain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSettingsMsg({ type: "success", text: "Settings saved" });
      loadDomains();
      setTimeout(() => setSettingsDomain(null), 1200);
    } catch (e) {
      setSettingsMsg({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleAddInboxes() {
    if (!addInboxesDomain) return;
    const prefixes = addPrefixes.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!prefixes.length) return;
    setAddWorking(true);
    setAddMsg(null);
    try {
      const res  = await wsFetch(`/api/outreach/domains/${addInboxesDomain.id}/add-inboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          new_prefixes: prefixes,
          payment_provider: "stripe",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      // Redirect to Stripe/Paystack checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (e) {
      setAddMsg({ type: "error", text: e instanceof Error ? e.message : String(e) });
      setAddWorking(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Remove inbox "${label}"? This will stop all campaigns using it.`)) return;
    await deleteInbox(id);
    load();
  }

  async function handleFileSelect(file: File | null) {
    setImportFile(file);
    setImportResult(null);
    setShowMapping(false);
    setCsvHeaders([]);
    if (!file) return;
    const text = await file.text();
    const headers = parseCsvHeaders(text);
    setCsvHeaders(headers);
    setColMapping(autoMap(headers));
    setShowMapping(true);
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const rawText = await importFile.text();
      const csvText = (showMapping && Object.keys(colMapping).length > 0)
        ? remapCsv(rawText, colMapping)
        : rawText;
      const rows = parseCsvRows(csvText);

      const result = await importInboxes(rows);
      setImportResult(result);
      if (result.imported > 0) {
        showToast(`Imported ${result.imported} inbox${result.imported !== 1 ? "es" : ""}`);
        load();
      }
      setImportFile(null);
      setShowMapping(false);
      setCsvHeaders([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  }

  async function toggleStatus(inbox: OutreachInboxSafe) {
    const newStatus = inbox.status === "active" ? "paused" : "active";
    await updateInbox(inbox.id, { status: newStatus });
    load();
  }

  function openDrawer(inbox: OutreachInboxSafe) {
    setDrawerInbox(inbox);
    setDrawerEdits({});
    setDelivResult(null);
  }

  function df<K extends keyof OutreachInboxSafe>(key: K): OutreachInboxSafe[K] {
    if (!drawerInbox) return undefined as unknown as OutreachInboxSafe[K];
    return (key in drawerEdits ? drawerEdits[key] : drawerInbox[key]) as OutreachInboxSafe[K];
  }

  function setDf(key: keyof OutreachInboxSafe, value: unknown) {
    setDrawerEdits((e) => ({ ...e, [key]: value }));
  }

  async function handleDrawerSave() {
    if (!drawerInbox || !Object.keys(drawerEdits).length) return;
    setDrawerSaving(true);
    const updated = await updateInbox(drawerInbox.id, drawerEdits);
    setInboxes((prev) => prev.map((i) => i.id === drawerInbox.id ? { ...i, ...drawerEdits } : i));
    setDrawerInbox((prev) => prev ? { ...prev, ...drawerEdits } : prev);
    setDrawerEdits({});
    setDrawerSaving(false);
    showToast("Saved");
    void updated;
  }

  async function handleDelivTest() {
    if (!drawerInbox) return;
    setDelivTesting(true);
    setDelivResult(null);
    try {
      const { wsFetch } = await import("@/lib/workspace/client");
      const body = delivRecipient.trim() ? { to: delivRecipient.trim() } : undefined;
      const r = await wsFetch(`/api/outreach/inboxes/${drawerInbox.id}/test-deliverability`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      setDelivResult(d.message ?? (d.error ? `Error: ${d.error}` : "Test sent"));
    } catch {
      setDelivResult("Request failed");
    }
    setDelivTesting(false);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${toast.startsWith("Error") ? "bg-red-500/20 border border-red-500/40 text-red-300" : "bg-green-500/20 border border-green-500/40 text-green-300"}`}>
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Inboxes</h1>
          <p className="text-white/40 text-sm mt-0.5">Manage sending accounts for cold outreach</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "inboxes" && (<>
            <button
              onClick={() => { setShowImport(true); setImportResult(null); setShowMapping(false); setCsvHeaders([]); setImportFile(null); }}
              className="px-4 py-2 bg-white/8 hover:bg-white/12 text-white/70 hover:text-white rounded-xl text-sm font-semibold transition-colors border border-white/10"
            >
              Import CSV
            </button>
            <Link href="/inboxes/new" className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
              + Add Inbox
            </Link>
          </>)}
          {activeTab === "domains" && (
            <Link href="/inboxes/new/connect-domain" className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
              + Connect Domain
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-white/8 pb-0">
        {(["inboxes", "domains"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize rounded-t-lg transition-colors border-b-2 -mb-px ${activeTab === t ? "text-white border-blue-500" : "text-white/40 border-transparent hover:text-white/60"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── DOMAINS TAB ────────────────────────────────────────────────────────── */}
      {activeTab === "domains" && (
        <div className="space-y-3">
          {domainsLoading ? (
            [1,2,3].map((i) => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)
          ) : domains.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <div className="text-4xl mb-3">🌐</div>
              <p className="text-sm font-medium">No connected domains yet</p>
              <p className="text-xs mt-1">Connect a domain to get auto-provisioned inboxes with DKIM, DMARC, and MAIL FROM set up automatically</p>
              <Link href="/inboxes/new/connect-domain" className="inline-block mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">
                Connect a Domain
              </Link>
            </div>
          ) : (
            <div className="border border-white/8 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-white/3 border-b border-white/6 text-white/35 text-xs font-semibold uppercase tracking-wider">
                <div>Domain</div><div>Inboxes</div><div>Status</div><div>Warmup ends</div><div className="w-48"></div>
              </div>
              {domains.map((d) => {
                const warmupDaysLeft = d.warmup_ends_at
                  ? Math.max(0, Math.ceil((new Date(d.warmup_ends_at).getTime() - Date.now()) / 86_400_000))
                  : null;
                const isReconfiguring = reconfiguringId === d.id;
                const isPolling       = pollingIds.has(d.id);
                const liveCount       = d.inbox_count ?? d.mailbox_count;
                const canAddMore      = d.status === "active" && liveCount < 5;
                return (
                  <div key={d.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                    <div>
                      <p className="text-white text-sm font-medium">{d.domain}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-white/30 text-xs">{new Date(d.created_at).toLocaleDateString()}</p>
                        {d.redirect_url && <span className="text-[10px] text-sky-400/70 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">↗ redirect</span>}
                        {d.reply_forward_to && <span className="text-[10px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">✉ forward</span>}
                      </div>
                    </div>
                    <div className="text-white/60 text-sm">{liveCount} / 5</div>
                    <div>
                      {isReconfiguring ? (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 animate-spin text-orange-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          <span className="text-orange-400 text-[10px] font-medium">{reconfiguringStep || "Applying…"}</span>
                        </div>
                      ) : isPolling ? (
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"/>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"/>
                          </span>
                          <span className="text-amber-400 text-[10px] font-medium">Awaiting DNS…</span>
                        </div>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          d.status === "active"      ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" :
                          d.status === "failed"      ? "text-red-400 bg-red-500/15 border-red-500/30" :
                          d.status === "dns_pending" ? "text-amber-400 bg-amber-500/15 border-amber-500/30" :
                          "text-white/40 bg-white/5 border-white/10"
                        }`}>{d.status === "dns_pending" ? "DNS pending" : d.status}</span>
                      )}
                    </div>
                    <div className="text-white/50 text-xs">
                      {warmupDaysLeft !== null ? (warmupDaysLeft > 0 ? `${warmupDaysLeft}d left` : "Done") : "—"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canAddMore && (
                        <button
                          onClick={() => { setAddInboxesDomain(d); setAddPrefixes(""); setAddMsg(null); }}
                          className="px-3 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 hover:text-orange-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                          title={`Add more inboxes (${5 - liveCount} slot${5 - liveCount !== 1 ? "s" : ""} left)`}
                        >
                          + Inboxes
                        </button>
                      )}
                      {d.status === "active" && (
                        <button
                          onClick={() => openSettings(d)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
                          title="Domain settings (redirect, forwarding)"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleReconfigure(d.id)}
                        disabled={isReconfiguring || isPolling}
                        className="px-3 py-1.5 bg-white/6 hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed text-white/60 hover:text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                        title="Re-register with Postal and re-publish DNS records"
                      >
                        {isReconfiguring ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Applying…
                          </span>
                        ) : "↻ Re-configure"}
                      </button>
                      <button
                        onClick={() => handleDeleteDomain(d.id, d.domain)}
                        disabled={isReconfiguring}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                        title="Delete domain record"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "inboxes" && (<>

      {/* Trial expired — outreach paywall */}
      {trialExpired && (
        <div className="mb-5 bg-red-500/8 border border-red-500/25 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-red-300 text-sm font-semibold">Your free trial has expired</p>
            <p className="text-white/40 text-xs mt-0.5">
              Inbox warmup and outreach are paused. Upgrade to a paid plan to re-enable your inboxes and keep sequences running.
              You can still use lead campaigns (scrape, verify, AI) if you have credits.
            </p>
          </div>
          <Link
            href="/settings?tab=billing"
            className="flex-shrink-0 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            Upgrade now →
          </Link>
        </div>
      )}

      {/* Free plan — inbox count indicator */}
      {!trialExpired && planId === "free" && maxInboxes > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-white/40">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
          Free plan: {inboxes.length} / {maxInboxes} inboxes used
          {inboxes.length >= maxInboxes && <span className="text-amber-400 font-medium ml-1">· Limit reached — <Link href="/settings?tab=billing" className="underline">upgrade</Link> to add more</span>}
        </div>
      )}

      {/* Admin consent banner — shown when Outlook inboxes exist without OAuth */}
      {!loading && inboxes.some((i) => i.provider === "outlook" && !i.has_oauth) && (
        <div className="mb-5 bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-sm font-semibold">Microsoft admin consent required</p>
            <p className="text-white/40 text-xs mt-0.5">
              Your Microsoft 365 tenant requires an admin to approve this app before individual inboxes can connect.
              Grant consent once and all inboxes can connect without this prompt.
            </p>
          </div>
          <a
            href="/api/outreach/inboxes/oauth/microsoft?admin_consent=1"
            className="flex-shrink-0 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            Grant Admin Consent →
          </a>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : inboxes.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-4xl mb-4">📬</div>
          <p className="font-medium">No inboxes connected yet</p>
          <p className="text-sm mt-1">Add a Gmail, Outlook, or SMTP inbox to start sending</p>
        </div>
      ) : (
        <>
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/15 border border-orange-500/30 rounded-xl">
              <span className="text-orange-300 text-xs font-semibold flex-1">
                {effectiveCount} inbox{effectiveCount !== 1 ? "es" : ""} selected
                {!allSelected && inboxes.length > PAGE_SIZE && (
                  <button onClick={selectAllInboxes} className="ml-2 text-orange-400 hover:text-orange-200 underline transition-colors">
                    Select all {inboxes.length}
                  </button>
                )}
              </span>
              <button onClick={() => handleBulkStatusChange("active")} disabled={bulkWorking} className="px-3 py-1.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-semibold rounded-lg border border-green-500/30 transition-colors disabled:opacity-40">Resume</button>
              <button onClick={() => handleBulkStatusChange("paused")} disabled={bulkWorking} className="px-3 py-1.5 bg-white/8 hover:bg-white/12 text-white/60 text-xs font-semibold rounded-lg border border-white/10 transition-colors disabled:opacity-40">Pause</button>
              <button onClick={() => setShowBulkEdit(true)}            disabled={bulkWorking} className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 text-xs font-semibold rounded-lg border border-violet-500/30 transition-colors disabled:opacity-40">Edit settings</button>
              <button onClick={handleBulkDelete}                        disabled={bulkWorking} className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold rounded-lg border border-red-500/30 transition-colors disabled:opacity-40">Delete</button>
              <button onClick={clearSelection} className="text-white/30 hover:text-white/60 text-xs ml-1 transition-colors">✕</button>
            </div>
          </div>
        )}

        {/* Select-all row header */}
        <div className="flex items-center gap-3 px-1 pb-1">
          <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
            className="w-4 h-4 rounded accent-orange-500 cursor-pointer flex-shrink-0" />
          <span className="text-white/30 text-xs">{allPageSelected ? "Deselect all on page" : "Select all on page"}</span>
        </div>

        <div className="space-y-2">
          {pageInboxes.map((inbox) => {
            const color = PROVIDER_COLORS[inbox.provider] ?? "#888";
            const isSelected = selected.has(inbox.id);
            const warmupPct = inbox.warmup_target_daily > 0
              ? Math.min(100, Math.round(((inbox.warmup_current_daily ?? 0) / inbox.warmup_target_daily) * 100))
              : 0;
            return (
              <div key={inbox.id} className={`bg-white/4 border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${isSelected ? "border-orange-500/50 bg-orange-500/8" : "border-white/8 hover:border-white/12"}`}>
                {/* Checkbox */}
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inbox.id)}
                  className="w-4 h-4 rounded accent-orange-500 cursor-pointer flex-shrink-0" />
                {/* Profile avatar */}
                <InboxAvatar
                  inbox={inbox}
                  size={36}
                  onUploaded={(url) => setInboxes(prev => prev.map(i => i.id === inbox.id ? { ...i, profile_image_url: url } : i))}
                />

                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDrawer(inbox)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm truncate max-w-xs">{inbox.email_address}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${inbox.status === "active" ? "bg-green-500/15 text-green-400" : inbox.status === "error" ? "bg-red-500/15 text-red-400" : "bg-white/10 text-white/40"}`}>
                      {inbox.status}
                    </span>
                    {inbox.has_oauth && <span className="text-[10px] text-green-400/60 flex-shrink-0">● OAuth</span>}
                    {inbox.warmup_ends_at && new Date(inbox.warmup_ends_at) > new Date() && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 flex-shrink-0">
                        Warming · {Math.ceil((new Date(inbox.warmup_ends_at).getTime() - Date.now()) / 86_400_000)}d left
                      </span>
                    )}
                    {inbox.warmup_enabled && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400/60 rounded-full transition-all" style={{ width: `${warmupPct}%` }} />
                        </div>
                        <span className="text-amber-400/70 text-[10px]">{inbox.warmup_current_daily ?? 0}/{inbox.warmup_target_daily}/d</span>
                      </div>
                    )}
                  </div>
                  {(inbox.first_name || inbox.last_name) && (
                    <p className="text-white/40 text-xs mt-0.5">{[inbox.first_name, inbox.last_name].filter(Boolean).join(" ")} · {inbox.daily_send_limit}/day</p>
                  )}
                  {inbox.last_error && <p className="text-red-400/80 text-[10px] mt-0.5 truncate">⚠ {inbox.last_error}</p>}
                </div>

                {/* Icon actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Settings */}
                  <button onClick={() => openDrawer(inbox)} title="Settings" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </button>
                  {/* Pause / Resume */}
                  <button onClick={() => toggleStatus(inbox)} title={inbox.status === "active" ? "Pause" : "Resume"} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors">
                    {inbox.status === "active" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
                    )}
                  </button>
                  {/* Delete */}
                  <button onClick={() => handleDelete(inbox.id, inbox.label)} title="Delete inbox" className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {inboxes.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/8">
            <span className="text-white/30 text-xs">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, inboxes.length)} of {inboxes.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 bg-white/6 hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs font-medium rounded-lg transition-colors"
              >
                ← Prev
              </button>
              <span className="text-white/40 text-xs">Page {page + 1} / {Math.ceil(inboxes.length / PAGE_SIZE)}</span>
              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(inboxes.length / PAGE_SIZE) - 1, p + 1))}
                disabled={(page + 1) * PAGE_SIZE >= inboxes.length}
                className="px-3 py-1.5 bg-white/6 hover:bg-white/10 disabled:opacity-30 text-white/60 text-xs font-medium rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        </>
      )}
      </>)}

      {/* Import CSV modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="text-white font-semibold">Import Inboxes via CSV</h2>
              <button onClick={() => setShowImport(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Info */}
              <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl p-4 space-y-1.5">
                <p className="text-orange-300 text-xs font-semibold">Supports Gmail, Outlook, and custom SMTP</p>
                <p className="text-white/40 text-xs">Gmail → use App Passwords with smtp.gmail.com · Outlook → smtp-mail.outlook.com · Microsoft 365 → smtp.office365.com</p>
                <p className="text-white/40 text-xs">Each inbox is verified before saving. Provider is auto-detected from smtp_host.</p>
              </div>

              {/* Template download */}
              <button onClick={downloadTemplate} className="text-orange-400 hover:text-orange-300 text-xs underline transition-colors">
                Download CSV template (with examples)
              </button>

              {/* File input */}
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">CSV File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/70 file:text-xs file:font-semibold hover:file:bg-white/15 cursor-pointer"
                />
              </div>

              {/* Column mapping */}
              {showMapping && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Map Columns</p>
                  <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {INBOX_FIELDS.map((field) => (
                      <div key={field.key} className="flex items-center gap-3 px-3 py-2">
                        <span className={`text-xs w-36 flex-shrink-0 ${field.required ? "text-white/70" : "text-white/35"}`}>
                          {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                        </span>
                        <select
                          value={colMapping[field.key] ?? ""}
                          onChange={(e) => setColMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                          className="flex-1 bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-orange-500/50"
                        >
                          <option value="">— skip —</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import button */}
              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Verifying & importing…
                  </>
                ) : "Import Inboxes"}
              </button>

              {/* Import error */}
              {importError && (
                <div className="mt-3 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <div>
                    <p className="font-semibold">{importError}</p>
                    {importError.toLowerCase().includes("trial") || importError.toLowerCase().includes("limit") || importError.toLowerCase().includes("plan") ? (
                      <Link href="/settings?tab=billing" className="text-orange-400 underline text-xs mt-0.5 block">Upgrade your plan →</Link>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Results */}
              {importResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-400 font-semibold">{importResult.imported} imported</span>
                    {importResult.skipped_duplicate > 0 && <span className="text-white/40">{importResult.skipped_duplicate} duplicate{importResult.skipped_duplicate !== 1 ? "s" : ""} skipped</span>}
                    {(importResult.failed_verification ?? 0) > 0 && <span className="text-amber-400">{importResult.failed_verification} failed verification</span>}
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                      <p className="text-red-400 text-xs font-semibold mb-1.5">{importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""}:</p>
                      {(importResult.errors as { row: number; email: string; message: string }[]).map((e, i) => (
                        <div key={i} className="text-red-300/70 text-xs">
                          {e.row > 0 ? `Row ${e.row}` : "Batch"} · <span className="text-red-300/50">{e.email}</span> — {e.message}
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setShowImport(false)} className="w-full py-2 bg-white/8 hover:bg-white/12 text-white/70 text-sm font-medium rounded-xl transition-colors">
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inbox drawer ──────────────────────────────────────────────────────── */}
      {drawerInbox && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setDrawerInbox(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-[#141414] border-l border-white/10 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-3">
                <InboxAvatar
                  inbox={{ ...drawerInbox, ...drawerEdits }}
                  size={40}
                  onUploaded={(url) => {
                    setDrawerEdits(e => ({ ...e, profile_image_url: url }));
                    setInboxes(prev => prev.map(i => i.id === drawerInbox.id ? { ...i, profile_image_url: url } : i));
                  }}
                />
                <div>
                  <p className="text-white font-semibold text-sm truncate max-w-xs">{drawerInbox.email_address}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${drawerInbox.status === "active" ? "bg-green-500/15 text-green-400" : drawerInbox.status === "error" ? "bg-red-500/15 text-red-400" : "bg-white/10 text-white/40"}`}>{drawerInbox.status}</span>
                    {drawerInbox.has_oauth && <span className="text-[10px] text-green-400/60">● OAuth connected</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setDrawerInbox(null)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* OAuth connect (if missing) */}
              {!drawerInbox.has_oauth && (drawerInbox.provider === "gmail" || drawerInbox.provider === "outlook") && (
                <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 flex items-center justify-between gap-3">
                  <p className="text-amber-300 text-xs">OAuth not connected — reply detection disabled</p>
                  <a
                    href={drawerInbox.provider === "gmail"
                      ? `/api/outreach/inboxes/oauth/google?label=${encodeURIComponent(drawerInbox.label)}&inbox_id=${drawerInbox.id}`
                      : `/api/outreach/inboxes/oauth/microsoft?label=${encodeURIComponent(drawerInbox.label)}&email=${encodeURIComponent(drawerInbox.email_address)}`}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Connect OAuth →
                  </a>
                </div>
              )}

              {/* Identity */}
              <section>
                <h3 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">Identity</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Label</label>
                    <input value={(df("label") as string) ?? ""} onChange={(e) => setDf("label", e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/40 mb-1">First name</label>
                      <input value={(df("first_name") as string) ?? ""} onChange={(e) => setDf("first_name", e.target.value)}
                        placeholder="e.g. John"
                        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 mb-1">Last name</label>
                      <input value={(df("last_name") as string) ?? ""} onChange={(e) => setDf("last_name", e.target.value)}
                        placeholder="e.g. Smith"
                        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Signature (appended to emails)</label>
                    <textarea rows={3} value={(df("signature") as string) ?? ""} onChange={(e) => setDf("signature", e.target.value)}
                      placeholder="e.g. Best,&#10;John Smith&#10;ProPlan Studio"
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 resize-none" />
                  </div>
                </div>
              </section>

              {/* Sending */}
              <section>
                <h3 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">Sending</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Daily send limit</label>
                    <input type="number" min="1" max="500" value={(df("daily_send_limit") as number) ?? ""} onChange={(e) => setDf("daily_send_limit", parseInt(e.target.value))}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/40 mb-1">Window start</label>
                      <input type="time" value={(df("send_window_start") as string) ?? ""} onChange={(e) => setDf("send_window_start", e.target.value)}
                        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 mb-1">Window end</label>
                      <input type="time" value={(df("send_window_end") as string) ?? ""} onChange={(e) => setDf("send_window_end", e.target.value)}
                        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50" />
                    </div>
                  </div>
                  <p className="text-white/20 text-[10px]">Send window timezone is set per campaign, not per inbox.</p>
                </div>
              </section>

              {/* Warmup */}
              <section>
                <h3 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">Warmup</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-sm">Enable warmup</p>
                      <p className="text-white/35 text-xs">Sends pool emails to build inbox reputation</p>
                    </div>
                    <div
                      onClick={() => setDf("warmup_enabled", !df("warmup_enabled"))}
                      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ${df("warmup_enabled") ? "bg-orange-500" : "bg-white/15"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${df("warmup_enabled") ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                  </div>
                  {df("warmup_enabled") && (
                    <>
                      <div className="bg-white/3 border border-white/6 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white/40 text-xs">Current daily volume</span>
                          <span className="text-white/70 text-sm font-semibold">{drawerInbox.warmup_current_daily ?? 0} emails/day</span>
                        </div>
                        <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400/70 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(((drawerInbox.warmup_current_daily ?? 0) / (drawerInbox.warmup_target_daily || 1)) * 100))}%` }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-white/20 text-[10px]">0</span>
                          <span className="text-white/20 text-[10px]">Target: {drawerInbox.warmup_target_daily}/day</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Target daily</label>
                          <input type="number" min="1" max="200" value={(df("warmup_target_daily") as number) ?? ""} onChange={(e) => setDf("warmup_target_daily", parseInt(e.target.value))}
                            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 mb-1">Ramp / week</label>
                          <input type="number" min="1" max="50" value={(df("warmup_ramp_per_week") as number) ?? ""} onChange={(e) => setDf("warmup_ramp_per_week", parseInt(e.target.value))}
                            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Health */}
              <section>
                <h3 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">Health</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Status</label>
                    <select value={(df("status") as string) ?? "active"} onChange={(e) => setDf("status", e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  {drawerInbox.last_error && (
                    <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3">
                      <p className="text-red-400/80 text-xs font-semibold mb-1">Last error</p>
                      <p className="text-red-300/60 text-xs">{drawerInbox.last_error}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="Recipient (leave blank for your email)"
                        value={delivRecipient}
                        onChange={e => setDelivRecipient(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white/6 border border-white/10 rounded-lg text-white/80 text-xs placeholder:text-white/30 focus:outline-none focus:border-white/25"
                      />
                      <button onClick={handleDelivTest} disabled={delivTesting}
                        className="px-4 py-2 bg-white/6 hover:bg-white/10 disabled:opacity-40 text-white/60 text-xs font-semibold rounded-lg border border-white/10 transition-colors whitespace-nowrap">
                        {delivTesting ? "Sending…" : "Test Deliverability"}
                      </button>
                    </div>
                    {delivResult && <span className={`text-xs ${delivResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{delivResult}</span>}
                  </div>
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-white/8 px-5 py-4 flex gap-3">
              <button onClick={() => setDrawerInbox(null)} className="flex-1 py-2.5 bg-white/6 hover:bg-white/10 text-white/50 text-sm font-semibold rounded-xl transition-colors">
                Close
              </button>
              <button onClick={handleDrawerSave} disabled={drawerSaving || !Object.keys(drawerEdits).length}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                {drawerSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bulk edit modal */}
      {showBulkEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="text-white font-semibold">Edit {selected.size} Inbox{selected.size !== 1 ? "es" : ""}</h2>
              <button onClick={() => setShowBulkEdit(false)} className="text-white/40 hover:text-white transition-colors text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-white/40 text-xs">Only filled fields will be updated. Leave blank to keep existing values.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">First name</label>
                  <input
                    type="text" placeholder="e.g. John"
                    value={bulkFields.first_name}
                    onChange={(e) => setBulkFields((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Last name</label>
                  <input
                    type="text" placeholder="e.g. Smith"
                    value={bulkFields.last_name}
                    onChange={(e) => setBulkFields((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Daily send limit</label>
                  <input
                    type="number" min="1" max="500"
                    placeholder="e.g. 50"
                    value={bulkFields.daily_send_limit}
                    onChange={(e) => setBulkFields((f) => ({ ...f, daily_send_limit: e.target.value }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={bulkFields.status}
                    onChange={(e) => setBulkFields((f) => ({ ...f, status: e.target.value as "" | "active" | "paused" }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50"
                  >
                    <option value="">— no change —</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send window start</label>
                  <input
                    type="time"
                    value={bulkFields.send_window_start}
                    onChange={(e) => setBulkFields((f) => ({ ...f, send_window_start: e.target.value }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send window end</label>
                  <input
                    type="time"
                    value={bulkFields.send_window_end}
                    onChange={(e) => setBulkFields((f) => ({ ...f, send_window_end: e.target.value }))}
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Timezone</label>
                <input
                  type="text"
                  placeholder="e.g. America/New_York"
                  value={bulkFields.timezone}
                  onChange={(e) => setBulkFields((f) => ({ ...f, timezone: e.target.value }))}
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              {/* Warmup section */}
              <div className="pt-2 border-t border-white/8">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Warmup</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Warmup enabled</label>
                    <select value={bulkFields.warmup_enabled} onChange={(e) => setBulkFields((f) => ({ ...f, warmup_enabled: e.target.value as "" | "true" | "false" }))}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none">
                      <option value="">— no change —</option>
                      <option value="true">Enable</option>
                      <option value="false">Disable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Target daily</label>
                    <input type="number" min="1" max="200" placeholder="e.g. 40"
                      value={bulkFields.warmup_target_daily}
                      onChange={(e) => setBulkFields((f) => ({ ...f, warmup_target_daily: e.target.value }))}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Ramp per week</label>
                    <input type="number" min="1" max="50" placeholder="e.g. 5"
                      value={bulkFields.warmup_ramp_per_week}
                      onChange={(e) => setBulkFields((f) => ({ ...f, warmup_ramp_per_week: e.target.value }))}
                      className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowBulkEdit(false)} className="flex-1 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 text-sm font-semibold rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={handleBulkEdit} disabled={bulkWorking} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                  {bulkWorking ? "Saving…" : "Apply changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
