"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { wsGet, wsPost, wsPatch, wsDelete } from "@/lib/workspace/client";
import { useCurrency } from "@/lib/currency";
import { PLANS, CREDIT_PACKS as CREDIT_PACKS_CONFIG, CREDIT_COSTS } from "@/lib/billing/plans";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "profile" | "security" | "team" | "billing" | "outreach";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile",  label: "Profile"        },
  { id: "security", label: "Security"       },
  { id: "team",     label: "Team"           },
  { id: "billing",  label: "Billing & Plans"},
  { id: "outreach", label: "Outreach"       },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 disabled:opacity-40 ${className}`}
    />
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
    >
      {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ${checked ? "bg-blue-600" : "bg-white/15"}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-white font-semibold">{title}</h2>
        {description && <p className="text-white/40 text-xs mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Profile Tab ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const [data, setData]   = useState({ email: "", full_name: "", workspace_name: "", role: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    wsGet<typeof data>("/api/settings/profile").then(setData).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    await wsPatch("/api/settings/profile", { full_name: data.full_name, workspace_name: data.workspace_name });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const initials = (data.full_name || data.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Section title="Personal Information" description="Your name and email address.">
        <div className="flex items-center gap-4 pb-2">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-white font-medium">{data.full_name || data.email}</p>
            <p className="text-white/40 text-xs capitalize">{data.role}</p>
          </div>
        </div>
        <Field label="Full Name">
          <Input
            value={data.full_name}
            onChange={e => setData(d => ({ ...d, full_name: e.target.value }))}
            placeholder="Jane Smith"
          />
        </Field>
        <Field label="Email address">
          <Input value={data.email} disabled />
        </Field>
      </Section>

      <Section title="Workspace" description="Your workspace name shown throughout the app.">
        <Field label="Workspace Name">
          <Input
            value={data.workspace_name}
            onChange={e => setData(d => ({ ...d, workspace_name: e.target.value }))}
            placeholder="Acme Corp"
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

// ── Security Tab ───────────────────────────────────────────────────────────────

function SecurityTab() {
  const [pw, setPw]         = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function changePassword() {
    if (pw.next !== pw.confirm) { setMsg({ type: "err", text: "Passwords don't match" }); return; }
    if (pw.next.length < 8)     { setMsg({ type: "err", text: "Password must be at least 8 characters" }); return; }
    setSaving(true);
    try {
      await wsPost("/api/settings/password", { password: pw.next });
      setSaving(false);
      setMsg({ type: "ok", text: "Password updated" });
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      setSaving(false);
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="space-y-6">
      <Section title="Change Password" description="Use a strong password you don't use elsewhere.">
        <Field label="New Password">
          <Input
            type="password"
            value={pw.next}
            onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
            placeholder="At least 8 characters"
          />
        </Field>
        <Field label="Confirm New Password">
          <Input
            type="password"
            value={pw.confirm}
            onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
            placeholder="Repeat password"
          />
        </Field>
        {msg && (
          <p className={`text-sm ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}
        <div className="flex justify-end pt-1">
          <button
            onClick={changePassword}
            disabled={saving || !pw.next || !pw.confirm}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? "Updating…" : "Update Password"}
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Team Tab ───────────────────────────────────────────────────────────────────

type Member = { id: string; user_id: string; role: string; joined_at: string; email: string; full_name: string };
type Invite  = { id: string; email: string; role: string; created_at: string };

function TeamTab() {
  const [members, setMembers]   = useState<Member[]>([]);
  const [invites, setInvites]   = useState<Invite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  function load() {
    setLoading(true);
    wsGet<{ members: Member[]; invites: Invite[] }>("/api/settings/team").then(d => {
      setMembers(d.members ?? []);
      setInvites(d.invites ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function sendInvite() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await wsPost("/api/settings/team", { email: inviteEmail });
      setInviting(false);
      setInviteEmail(""); load(); setMsg("Invite sent");
    } catch (e) {
      setInviting(false);
      setMsg(e instanceof Error ? e.message : "Failed to invite");
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function removeMember(memberId: string) {
    await wsDelete("/api/settings/team", { member_id: memberId });
    load();
  }

  const ROLE_BADGE: Record<string, string> = {
    owner:  "bg-amber-500/15 text-amber-400",
    admin:  "bg-blue-500/15 text-blue-400",
    member: "bg-white/8 text-white/50",
  };

  return (
    <div className="space-y-6">
      <Section title="Team Members" description="People with access to this workspace.">
        {loading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-white/4 rounded-xl animate-pulse" />)}</div>
        ) : (
          <div className="divide-y divide-white/6">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/70">
                    {(m.full_name || m.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm">{m.full_name || m.email}</p>
                    {m.full_name && <p className="text-white/40 text-xs">{m.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[m.role] ?? ROLE_BADGE.member}`}>
                    {m.role}
                  </span>
                  {m.role !== "owner" && (
                    <button onClick={() => removeMember(m.id)} className="text-white/25 hover:text-red-400 transition-colors text-xs">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Invite Member" description="Send an invite link to a teammate.">
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendInvite()}
            placeholder="colleague@company.com"
            className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            {inviting ? "Sending…" : "Send Invite"}
          </button>
        </div>
        {msg && <p className="text-sm text-emerald-400">{msg}</p>}

        {invites.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Pending Invites</p>
            <div className="space-y-1">
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2 bg-white/3 rounded-lg">
                  <p className="text-white/60 text-sm">{inv.email}</p>
                  <span className="text-xs text-amber-400/70">Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Billing & Plans Tab ────────────────────────────────────────────────────────

const PLANS_DISPLAY = [
  { id: "free",    name: "Free",    price: 0,   credits: 0,      sends: "1,000/mo"  },
  { id: "starter", name: "Starter", price: 49,  credits: 500,    sends: "25,000/mo" },
  { id: "growth",  name: "Growth",  price: 149, credits: 2000,   sends: "150,000/mo"},
  { id: "scale",   name: "Scale",   price: 399, credits: 10000,  sends: "1M/mo"     },
];

const CREDIT_PACKS = [
  { id: "pack_500",   credits: 500,   price_usd: 19,  label: "Starter pack" },
  { id: "pack_2000",  credits: 2000,  price_usd: 59,  label: "Growth pack"  },
  { id: "pack_5000",  credits: 5000,  price_usd: 129, label: "Best value"   },
  { id: "pack_10000", credits: 10000, price_usd: 249, label: "Scale pack"   },
] as const;

const TX_LABELS: Record<string, string> = { grant: "Monthly Grant", purchase: "Purchase", reserve: "Reserved", consume: "Used", refund: "Refunded" };
const TX_COLORS: Record<string, string> = { grant: "text-emerald-400", purchase: "text-emerald-400", refund: "text-emerald-400", reserve: "text-amber-400", consume: "text-red-400" };

type Transaction = { id: string; type: string; amount: number; description: string | null; created_at: string };

function BillingTab() {
  const [planId, setPlanId]         = useState("free");
  const [balance, setBalance]       = useState(0);
  const [transactions, setTx]       = useState<Transaction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      wsGet<{ plan_id: string }>("/api/settings/profile"),
      wsGet<{ balance: number; transactions: Transaction[] }>("/api/lead-campaigns/credits"),
    ]).then(([profile, credits]) => {
      setPlanId(profile.plan_id ?? "free");
      setBalance(credits.balance ?? 0);
      setTx(credits.transactions ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handlePurchase(packId: string) {
    setPurchasing(packId);
    try {
      const data = await wsPost<{ url?: string }>("/api/lead-campaigns/credits/purchase", { pack_id: packId });
      if (data.url) window.location.href = data.url;
      else { alert("Purchase failed"); setPurchasing(null); }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Purchase failed");
      setPurchasing(null);
    }
  }

  const currentPlan = PLANS_DISPLAY.find(p => p.id === planId) ?? PLANS_DISPLAY[0];

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Section title="Current Plan">
        <div className="flex items-center justify-between p-4 bg-white/3 border border-white/8 rounded-xl">
          <div>
            <p className="text-white font-semibold text-lg">{currentPlan.name}</p>
            <p className="text-white/40 text-xs mt-0.5">{currentPlan.sends} · {currentPlan.credits.toLocaleString()} lead credits/mo</p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold text-xl">${currentPlan.price}<span className="text-white/30 text-sm font-normal">/mo</span></p>
            <a href="/api/billing/portal" className="text-blue-400 text-xs hover:underline mt-0.5 block">Manage subscription →</a>
          </div>
        </div>

        {/* Plan comparison */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          {PLANS_DISPLAY.map(plan => (
            <div
              key={plan.id}
              className={`rounded-xl p-3 border text-center transition-colors ${plan.id === planId ? "border-blue-500/40 bg-blue-500/8" : "border-white/8 bg-white/3"}`}
            >
              <p className="text-white text-sm font-semibold">{plan.name}</p>
              <p className="text-white/40 text-xs mt-0.5">${plan.price}/mo</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Lead credits */}
      <Section title="Lead Credits" description="Used for scraping, verifying, and personalizing leads.">
        <div className="flex items-end gap-3 pb-2">
          <span className="text-4xl font-bold text-white">{balance.toLocaleString()}</span>
          <span className="text-amber-400 font-medium mb-0.5">credits remaining</span>
        </div>
        <p className="text-white/30 text-xs -mt-2">Scrape 1cr · Verify 1cr · Personalize 2cr · Full suite 4cr</p>
      </Section>

      {/* Purchase packs */}
      <div>
        <p className="text-white font-semibold mb-3">Purchase Credits</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CREDIT_PACKS.map(pack => (
            <div
              key={pack.id}
              className={`relative border rounded-2xl p-4 flex flex-col gap-2 transition-colors ${
                pack.id === "pack_5000" ? "border-blue-500/40 bg-blue-500/8" : "border-white/8 bg-white/4 hover:bg-white/6"
              }`}
            >
              {pack.id === "pack_5000" && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-semibold rounded-full whitespace-nowrap">
                  Best value
                </span>
              )}
              <p className="text-xl font-bold text-white">{pack.credits.toLocaleString()}</p>
              <p className="text-white/40 text-xs -mt-1">credits</p>
              <p className="text-white/60 text-sm">${pack.price_usd} <span className="text-white/30 text-xs">one-time</span></p>
              <button
                onClick={() => handlePurchase(pack.id)}
                disabled={!!purchasing}
                className={`mt-auto py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                  pack.id === "pack_5000" ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-white/8 hover:bg-white/12 text-white"
                }`}
              >
                {purchasing === pack.id ? "Loading…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <Section title="Credit History">
          <div className="divide-y divide-white/6">
            {transactions.slice(0, 20).map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div>
                  <span className={`text-xs font-medium ${TX_COLORS[tx.type] ?? "text-white/50"}`}>{TX_LABELS[tx.type] ?? tx.type}</span>
                  {tx.description && <p className="text-white/35 text-xs mt-0.5">{tx.description}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-sm ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-white/30 text-[10px]">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Outreach Tab ───────────────────────────────────────────────────────────────

const OUTREACH_DEFAULTS = {
  footer_enabled:          "true",
  footer_address:          "123 Main Street, New York, NY 10001",
  footer_custom_text:      "You received this email because you or your company expressed interest in our services.",
  track_opens_default:     "true",
  track_clicks_default:    "true",
  default_daily_limit:     "30",
  default_timezone:        "America/New_York",
  default_send_start:      "09:00",
  default_send_end:        "17:00",
  // Domain registrant info (used when purchasing domains via Namecheap)
  registrant_first_name:   "",
  registrant_last_name:    "",
  registrant_email:        "",
  registrant_phone:        "",
  registrant_address:      "",
  registrant_city:         "",
  registrant_state:        "",
  registrant_zip:          "",
  registrant_country:      "US",
};
type OutreachSettings = typeof OUTREACH_DEFAULTS;

function OutreachTab() {
  const [settings, setSettings] = useState<OutreachSettings>({ ...OUTREACH_DEFAULTS });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    wsGet<Partial<OutreachSettings>>("/api/outreach/settings").then(data => {
      setSettings(prev => ({ ...prev, ...data }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function set(key: keyof OutreachSettings, value: string) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await wsPost("/api/outreach/settings", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const footerEnabled      = settings.footer_enabled === "true";
  const trackOpensDefault  = settings.track_opens_default === "true";
  const trackClicksDefault = settings.track_clicks_default === "true";

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Email Footer */}
      <section className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Email Footer</h2>
            <p className="text-white/40 text-xs mt-0.5">Appended to every outreach email. Includes unsubscribe link.</p>
          </div>
          <Toggle checked={footerEnabled} onChange={v => set("footer_enabled", String(v))} />
        </div>
        <div className={`p-6 space-y-4 transition-opacity ${footerEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <Field label="Footer Text">
            <textarea
              rows={2}
              value={settings.footer_custom_text}
              onChange={e => set("footer_custom_text", e.target.value)}
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="e.g. You received this email because…"
            />
          </Field>
          <Field label={<>Physical Address <span className="text-white/30 font-normal normal-case">(required for CAN-SPAM)</span></>}>
            <Input value={settings.footer_address} onChange={e => set("footer_address", e.target.value)} placeholder="123 Main Street, New York, NY 10001" />
          </Field>
          <div className="bg-white/3 border border-white/6 rounded-xl p-4 text-xs text-white/40 font-mono leading-relaxed">
            <p className="text-white/25 text-[10px] uppercase tracking-wider mb-2">Preview</p>
            <p>{settings.footer_custom_text}</p>
            <p className="mt-1"><span className="text-blue-400/60">Unsubscribe</span> · {settings.footer_address}</p>
          </div>
        </div>
      </section>

      {/* Tracking */}
      <Section title="Tracking Defaults" description="Defaults for new campaigns. Can be overridden per campaign.">
        <div className="space-y-3">
          {[
            { key: "track_opens_default" as const,  label: "Track email opens",  desc: "Injects a 1px invisible tracking pixel",           checked: trackOpensDefault  },
            { key: "track_clicks_default" as const, label: "Track link clicks",  desc: "Wraps links through a redirect for click tracking", checked: trackClicksDefault },
          ].map(({ key, label, desc, checked }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-sm font-medium">{label}</p>
                <p className="text-white/35 text-xs">{desc}</p>
              </div>
              <Toggle checked={checked} onChange={v => set(key, String(v))} />
            </div>
          ))}
        </div>
      </Section>

      {/* Inbox Defaults */}
      <Section title="Inbox Defaults" description="Applied when connecting a new inbox.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Daily send limit">
            <Input type="number" min="1" max="500" value={settings.default_daily_limit} onChange={e => set("default_daily_limit", e.target.value)} />
          </Field>
          <Field label="Timezone">
            <Input value={settings.default_timezone} onChange={e => set("default_timezone", e.target.value)} placeholder="America/New_York" />
          </Field>
          <Field label="Send window start">
            <Input type="time" value={settings.default_send_start} onChange={e => set("default_send_start", e.target.value)} className="text-white/70" />
          </Field>
          <Field label="Send window end">
            <Input type="time" value={settings.default_send_end} onChange={e => set("default_send_end", e.target.value)} className="text-white/70" />
          </Field>
        </div>
      </Section>

      {/* Domain Registrant */}
      <Section
        title="Domain Registrant Info"
        description="Used as the WHOIS contact when purchasing sending domains through Leadash. Saved once, reused for all future domain purchases."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name">
            <Input value={settings.registrant_first_name} onChange={e => set("registrant_first_name", e.target.value)} placeholder="Alex" />
          </Field>
          <Field label="Last name">
            <Input value={settings.registrant_last_name} onChange={e => set("registrant_last_name", e.target.value)} placeholder="Smith" />
          </Field>
          <Field label="Email address">
            <Input type="email" value={settings.registrant_email} onChange={e => set("registrant_email", e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field label="Phone (intl format)">
            <Input value={settings.registrant_phone} onChange={e => set("registrant_phone", e.target.value)} placeholder="+1.2125551234" />
          </Field>
        </div>
        <Field label="Street address">
          <Input value={settings.registrant_address} onChange={e => set("registrant_address", e.target.value)} placeholder="123 Main Street" />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="City">
            <Input value={settings.registrant_city} onChange={e => set("registrant_city", e.target.value)} placeholder="New York" />
          </Field>
          <Field label="State / Province">
            <Input value={settings.registrant_state} onChange={e => set("registrant_state", e.target.value)} placeholder="NY" />
          </Field>
          <Field label="ZIP / Postal code">
            <Input value={settings.registrant_zip} onChange={e => set("registrant_zip", e.target.value)} placeholder="10001" />
          </Field>
        </div>
        <Field label="Country (2-letter code)">
          <Input value={settings.registrant_country} onChange={e => set("registrant_country", e.target.value.toUpperCase().slice(0, 2))} placeholder="US" className="max-w-[80px]" />
        </Field>
        <p className="text-white/25 text-xs">
          This information is required by ICANN for domain registration. It appears in public WHOIS records unless domain privacy is enabled.
        </p>
      </Section>

      <div className="flex flex-col items-end gap-2">
        {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

// ── Root settings page ─────────────────────────────────────────────────────────

function SettingsInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const active       = (searchParams.get("tab") ?? "profile") as Tab;

  function navigate(tab: Tab) {
    router.replace(`/settings?tab=${tab}`);
  }

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <nav className="w-48 flex-shrink-0 border-r border-white/8 p-4 space-y-0.5">
        <p className="px-2 mb-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Settings</p>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              active === tab.id ? "bg-white/10 text-white font-medium" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {active === "profile"  && <ProfileTab />}
        {active === "security" && <SecurityTab />}
        {active === "team"     && <TeamTab />}
        {active === "billing"  && <BillingTab />}
        {active === "outreach" && <OutreachTab />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
