"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { wsGet, wsPost, wsPatch, wsDelete, wsFetch } from "@/lib/workspace/client";
import { useCurrency } from "@/lib/currency";
import { CREDIT_PACKS as CREDIT_PACKS_CONFIG, CREDIT_COSTS } from "@/lib/billing/plans";
import type { PlanConfig } from "@/lib/billing/getActivePlans";

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
      className={`w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 disabled:opacity-40 ${className}`}
    />
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
    >
      {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ${checked ? "bg-orange-500" : "bg-white/15"}`}
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
          <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
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
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
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
    admin:  "bg-orange-500/15 text-orange-400",
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
            className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
          />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
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

const TX_LABELS: Record<string, string> = { grant: "Monthly Grant", purchase: "Purchase", reserve: "Reserved", consume: "Used", refund: "Refunded" };
const TX_COLORS: Record<string, string> = { grant: "text-emerald-400", purchase: "text-emerald-400", refund: "text-emerald-400", reserve: "text-amber-400", consume: "text-red-400" };

type Transaction = { id: string; type: string; amount: number; description: string | null; created_at: string };
type Invoice     = { id: string; type: string; description: string; amount_kobo: number; paystack_reference: string | null; status: string; created_at: string };

const TX_PAGE_SIZE = 10;

const INVOICE_TYPE_LABELS: Record<string, string> = {
  plan_subscription: "Plan Subscription",
  credit_purchase:   "Lead Credits",
  domain_purchase:   "Domain Purchase",
  inbox_renewal:     "Inbox Renewal",
};
const INVOICE_TYPE_ICONS: Record<string, string> = {
  plan_subscription: "⭐",
  credit_purchase:   "💳",
  domain_purchase:   "🌐",
  inbox_renewal:     "📬",
};

function BillingTab({ paymentSuccess, paidPlanId, paystackReference, creditPurchaseSuccess }: { paymentSuccess?: boolean; paidPlanId?: string; paystackReference?: string; creditPurchaseSuccess?: boolean }) {
  const [planId, setPlanId]         = useState("free");
  const [planStatus, setPlanStatus] = useState("active");
  const [graceEndsAt, setGraceEndsAt] = useState<string | null>(null);
  const [plans, setPlans]           = useState<PlanConfig[]>([]);
  const [balance, setBalance]       = useState(0);
  const [transactions, setTx]       = useState<Transaction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [upgrading, setUpgrading]   = useState<string | null>(null);
  const [txPage, setTxPage]         = useState(0);
  const [activating, setActivating]           = useState(paymentSuccess ?? false);
  const [activated, setActivated]             = useState(false);
  const [creditVerifying, setCreditVerifying] = useState(creditPurchaseSuccess ?? false);
  const [creditActivated, setCreditActivated] = useState(false);
  const [grantedCredits, setGrantedCredits]   = useState(0);
  const [invoices, setInvoices]               = useState<Invoice[]>([]);
  const { currency } = useCurrency();
  const isNgn = currency === "NGN";

  useEffect(() => {
    Promise.all([
      wsGet<{ plan_id: string }>("/api/settings/profile"),
      wsGet<{ balance: number; transactions: Transaction[] }>("/api/lead-campaigns/credits"),
      fetch("/api/billing/plans").then(r => r.json()) as Promise<{ plans: PlanConfig[] }>,
      wsGet<Invoice[]>("/api/billing/invoices").catch(() => [] as Invoice[]),
    ]).then(([profile, credits, plansData, invData]) => {
      setPlanId(profile.plan_id ?? "free");
      setPlanStatus((profile as Record<string,string>).plan_status ?? "active");
      setGraceEndsAt((profile as Record<string,string|null>).grace_ends_at ?? null);
      setBalance(credits.balance ?? 0);
      setTx(credits.transactions ?? []);
      setPlans(plansData.plans ?? []);
      setInvoices(invData ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Verify payment + upgrade plan immediately on redirect, then reload credits
  useEffect(() => {
    if (!paymentSuccess || !paidPlanId) return;

    async function verify() {
      try {
        if (paystackReference) {
          // Eager verify — upgrades plan on the spot without waiting for webhook
          await wsPost("/api/billing/verify", { reference: paystackReference, plan_id: paidPlanId });
        }
        // Poll until plan_id matches (covers webhook path if ref not available)
        let tries = 0;
        const interval = setInterval(async () => {
          tries++;
          try {
            const profile = await wsGet<{ plan_id: string }>("/api/settings/profile");
            if (profile.plan_id === paidPlanId) {
              setPlanId(profile.plan_id);
              setActivating(false);
              setActivated(true);
              clearInterval(interval);
              wsGet<{ balance: number; transactions: Transaction[] }>("/api/lead-campaigns/credits")
                .then(c => { setBalance(c.balance ?? 0); setTx(c.transactions ?? []); })
                .catch(() => {});
            }
          } catch { /* ignore */ }
          if (tries >= 8) { setActivating(false); clearInterval(interval); }
        }, 1500);
        return () => clearInterval(interval);
      } catch { setActivating(false); }
    }
    verify();
  }, [paymentSuccess, paidPlanId, paystackReference]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verify credit purchase on return from Paystack
  useEffect(() => {
    if (!creditPurchaseSuccess) return;
    const ref = new URLSearchParams(window.location.search).get("reference")
      ?? new URLSearchParams(window.location.search).get("trxref");
    async function verifyCreditPurchase() {
      try {
        const result = await wsPost<{ granted?: number; balance?: number; already_processed?: boolean }>("/api/lead-campaigns/credits/verify", { reference: ref ?? "" });
        const newBalance = result.balance ?? 0;
        setBalance(newBalance);
        setGrantedCredits(result.granted ?? 0);
        setCreditVerifying(false);
        setCreditActivated(true);
        // Refresh transactions and invoices
        wsGet<{ balance: number; transactions: Transaction[] }>("/api/lead-campaigns/credits")
          .then(c => { setBalance(c.balance ?? 0); setTx(c.transactions ?? []); })
          .catch(() => {});
        wsGet<Invoice[]>("/api/billing/invoices").then(setInvoices).catch(() => {});
      } catch {
        setCreditVerifying(false);
      }
    }
    verifyCreditPurchase();
  }, [creditPurchaseSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePurchase(packId: string) {
    setPurchasing(packId);
    try {
      const callbackUrl = `${window.location.origin}/settings?tab=billing&credit_purchase=success`;
      const data = await wsPost<{ url?: string }>("/api/lead-campaigns/credits/purchase", { pack_id: packId, callback_url: callbackUrl });
      if (data.url) window.location.href = data.url;
      else { alert("Purchase failed"); setPurchasing(null); }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Purchase failed");
      setPurchasing(null);
    }
  }

  async function handleUpgrade(targetPlanId: string) {
    setUpgrading(targetPlanId);
    try {
      const data = await wsPost<{ url?: string }>("/api/billing/checkout", { plan_id: targetPlanId });
      if (data.url) window.location.href = data.url;
      else { alert("Upgrade failed"); setUpgrading(null); }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upgrade failed");
      setUpgrading(null);
    }
  }

  const currentPlan    = plans.find(p => p.plan_id === planId) ?? plans.find(p => p.plan_id === "free");
  const [invPage, setInvPage]         = useState(0);
  const INV_PAGE_SIZE                  = 8;

  const currentPrice   = currentPlan?.price_ngn ?? 0;
  const txPageCount    = Math.ceil(transactions.length / TX_PAGE_SIZE);
  const txSlice        = transactions.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);
  const invPageCount   = Math.ceil(invoices.length / INV_PAGE_SIZE);
  const invSlice       = invoices.slice(invPage * INV_PAGE_SIZE, (invPage + 1) * INV_PAGE_SIZE);

  function fmtPrice(plan: PlanConfig) {
    if (plan.price_ngn === 0) return "Free";
    return isNgn ? `₦${plan.price_ngn.toLocaleString()}` : `$${plan.price_usd}`;
  }

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-2xl animate-pulse" />)}</div>;

  const paidPlanName = plans.find(p => p.plan_id === paidPlanId)?.name ?? paidPlanId ?? "";

  return (
    <div className="space-y-6">
      {/* Payment success / activating banner */}
      {activating && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <svg className="w-5 h-5 text-emerald-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div>
            <p className="text-emerald-300 font-semibold text-sm">Payment received!</p>
            <p className="text-emerald-400/70 text-xs mt-0.5">Activating your {paidPlanName} plan — this takes just a moment…</p>
          </div>
        </div>
      )}
      {activated && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
          <div>
            <p className="text-emerald-300 font-semibold text-sm">Your {paidPlanName} plan is now active!</p>
            <p className="text-emerald-400/70 text-xs mt-0.5">Welcome to {paidPlanName}. Your credits and limits have been updated.</p>
          </div>
        </div>
      )}
      {creditVerifying && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl">
          <svg className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div>
            <p className="text-amber-300 font-semibold text-sm">Payment received!</p>
            <p className="text-amber-400/70 text-xs mt-0.5">Adding your credits — just a moment…</p>
          </div>
        </div>
      )}
      {creditActivated && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
          <div>
            <p className="text-emerald-300 font-semibold text-sm">{grantedCredits > 0 ? `${grantedCredits.toLocaleString()} credits added!` : "Credits confirmed!"}</p>
            <p className="text-emerald-400/70 text-xs mt-0.5">Your new balance is {balance.toLocaleString()} credits.</p>
          </div>
        </div>
      )}

      {/* ── Plan selection — full width ── */}
      <Section title="Plans">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {plans.map(plan => {
            const isCurrent = plan.plan_id === planId;
            const isUpgrade = plan.price_ngn > currentPrice;
            const fmtPool   = plan.max_leads_pool === 0 ? "—" : plan.max_leads_pool.toLocaleString();
            const fmtSeats  = plan.max_seats >= 999999 ? "Unlimited" : String(plan.max_seats);
            const fmtSends  = plan.max_monthly_sends === -1 ? "Unlimited" : plan.max_monthly_sends.toLocaleString();
            const fmtInbox  = plan.max_inboxes === -1 ? "Unlimited" : String(plan.max_inboxes);
            return (
              <div
                key={plan.plan_id}
                className={`rounded-xl p-4 border flex flex-col gap-3 transition-colors ${
                  isCurrent ? "border-orange-500/50 bg-orange-500/8" : "border-white/8 bg-white/3 hover:bg-white/5"
                }`}
              >
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white text-sm font-bold">{plan.name}</p>
                    {isCurrent && <span className="text-[9px] font-bold uppercase tracking-wide text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-full">Active</span>}
                  </div>
                  <p className="text-white font-bold text-lg leading-none">
                    {fmtPrice(plan)}
                    {plan.price_ngn > 0 && <span className="text-white/30 text-xs font-normal ml-1">/mo</span>}
                  </p>
                </div>

                {/* Feature rows */}
                <div className="space-y-1.5 text-[11px] border-t border-white/6 pt-3">
                  <div className="flex justify-between gap-1">
                    <span className="text-white/40">Credits/mo</span>
                    <span className="text-white/80 font-medium text-right">
                      {plan.included_credits === 0 ? "—" : plan.included_credits.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-white/40">Leads pool</span>
                    <span className="text-white/80 font-medium text-right">{fmtPool}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-white/40">Emails/mo</span>
                    <span className="text-white/80 font-medium text-right">{fmtSends}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-white/40">Inboxes</span>
                    <span className="text-white/80 font-medium text-right">{fmtInbox}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-white/40">Seats</span>
                    <span className="text-white/80 font-medium text-right">{fmtSeats}</span>
                  </div>
                </div>

                {/* CTA */}
                {isCurrent ? null : isUpgrade ? (
                  <button
                    onClick={() => handleUpgrade(plan.plan_id)}
                    disabled={!!upgrading}
                    className="mt-auto w-full py-1.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
                  >
                    {upgrading === plan.plan_id ? "…" : "Upgrade"}
                  </button>
                ) : (
                  <p className="mt-auto text-[10px] text-white/25 text-center">Lower tier</p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Two-column layout: credits (left) + history (right) ── */}
      <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Left column ── */}
      <div className="flex-1 min-w-0 space-y-6">

      {/* Lead credits */}
      <Section title="Lead Credits" description="Used for scraping, verifying, and personalizing leads.">
        <div className="flex items-end gap-3 pb-2">
          <span className="text-4xl font-bold text-white">{balance.toLocaleString()}</span>
          <span className="text-amber-400 font-medium mb-0.5">credits remaining</span>
        </div>
        <p className="text-white/30 text-xs -mt-2">
          Scrape {CREDIT_COSTS.scrape}cr · Verify {CREDIT_COSTS.verify}cr · AI Opener {CREDIT_COSTS.ai_personalize}cr
        </p>
      </Section>

      {/* Purchase packs */}
      <div>
        <p className="text-white font-semibold mb-3">Purchase Credits</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {CREDIT_PACKS_CONFIG.map(pack => {
            const isBest = pack.savingsPct >= 20;
            const price  = isNgn ? `₦${pack.priceNgn.toLocaleString()}` : `$${pack.priceUsd}`;
            return (
              <div
                key={pack.id}
                className={`relative border rounded-2xl p-4 flex flex-col gap-2 transition-colors ${
                  isBest ? "border-orange-500/40 bg-orange-500/8" : "border-white/8 bg-white/4 hover:bg-white/6"
                }`}
              >
                {pack.savingsPct > 0 && (
                  <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${
                    isBest ? "bg-orange-500 text-white" : "bg-white/10 text-white/60"
                  }`}>
                    Save {pack.savingsPct}%
                  </span>
                )}
                <p className="text-xl font-bold text-white">{pack.credits.toLocaleString()}</p>
                <p className="text-white/40 text-xs -mt-1">credits</p>
                <p className="text-white/60 text-sm">{price} <span className="text-white/30 text-xs">one-time</span></p>
                <button
                  onClick={() => handlePurchase(pack.id)}
                  disabled={!!purchasing}
                  className={`mt-auto py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                    isBest ? "bg-orange-500 hover:bg-orange-400 text-white" : "bg-white/8 hover:bg-white/12 text-white"
                  }`}
                >
                  {purchasing === pack.id ? "Loading…" : "Buy"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      </div> {/* end left column */}

      {/* ── Right column ── */}
      <div className="lg:w-[360px] shrink-0 space-y-6">

      {/* Payment History */}
      <Section title="Payment History" description="Plans, credits, domains & renewals.">
        {invoices.length === 0 ? (
          <p className="text-white/25 text-sm text-center py-4">No payments yet.</p>
        ) : (<>
          <div className="divide-y divide-white/6">
            {invSlice.map(inv => {
              const amountNgn = inv.amount_kobo / 100;
              const fmtAmt    = isNgn
                ? `₦${amountNgn.toLocaleString("en-NG")}`
                : `$${(amountNgn / 1600).toFixed(2)}`;
              return (
                <div key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center text-xs flex-shrink-0">
                    {INVOICE_TYPE_ICONS[inv.type] ?? "💰"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-xs font-medium truncate">{inv.description}</p>
                    <p className="text-white/35 text-[10px] mt-0.5">
                      {INVOICE_TYPE_LABELS[inv.type] ?? inv.type}
                      {" · "}
                      {new Date(inv.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {inv.amount_kobo > 0 && (
                      <p className="text-white font-semibold text-xs">{fmtAmt}</p>
                    )}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      inv.status === "paid"    ? "bg-emerald-500/15 text-emerald-400" :
                      inv.status === "failed"  ? "bg-red-500/15 text-red-400" :
                      "bg-white/8 text-white/40"
                    }`}>
                      {inv.status === "paid" ? "Paid" : inv.status === "failed" ? "Failed" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {invPageCount > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-white/6 mt-2">
              <p className="text-white/30 text-xs">
                {invPage * INV_PAGE_SIZE + 1}–{Math.min((invPage + 1) * INV_PAGE_SIZE, invoices.length)} of {invoices.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setInvPage(p => p - 1)} disabled={invPage === 0}
                  className="px-3 py-1 rounded-lg text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                <button onClick={() => setInvPage(p => p + 1)} disabled={invPage >= invPageCount - 1}
                  className="px-3 py-1 rounded-lg text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </>)}
      </Section>

      {/* Credit History */}
      {transactions.length > 0 && (
        <Section title="Credit History">
          <div className="divide-y divide-white/6">
            {txSlice.map(tx => (
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
          {txPageCount > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-white/6 mt-2">
              <p className="text-white/30 text-xs">
                {txPage * TX_PAGE_SIZE + 1}–{Math.min((txPage + 1) * TX_PAGE_SIZE, transactions.length)} of {transactions.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setTxPage(p => p - 1)} disabled={txPage === 0}
                  className="px-3 py-1 rounded-lg text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                <button onClick={() => setTxPage(p => p + 1)} disabled={txPage >= txPageCount - 1}
                  className="px-3 py-1 rounded-lg text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </Section>
      )}

      </div> {/* end right column */}
      </div> {/* end two-column flex */}
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

  // Default inbox profile image (separate from text settings)
  const [defaultImage, setDefaultImage]         = useState<string | null>(null);
  const [uploadingImage, setUploadingImage]     = useState(false);
  const [imageError, setImageError]             = useState<string | null>(null);
  const [imageSaved, setImageSaved]             = useState(false);
  useEffect(() => {
    wsGet<Partial<OutreachSettings> & { default_inbox_profile_image_url?: string | null }>("/api/outreach/settings").then(data => {
      setSettings(prev => ({ ...prev, ...data }));
      if (data.default_inbox_profile_image_url) setDefaultImage(data.default_inbox_profile_image_url);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleDefaultImageUpload(file: File) {
    setUploadingImage(true);
    setImageError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // No inbox_id → saves as workspace default
      const res = await wsFetch("/api/outreach/inboxes/profile-image", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error ?? res.statusText); }
      const { url } = await res.json() as { url: string };
      setDefaultImage(url);
      setImageSaved(true);
      setTimeout(() => setImageSaved(false), 2500);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

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
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 resize-none"
              placeholder="e.g. You received this email because…"
            />
          </Field>
          <Field label={<>Physical Address <span className="text-white/30 font-normal normal-case">(required for CAN-SPAM)</span></>}>
            <Input value={settings.footer_address} onChange={e => set("footer_address", e.target.value)} placeholder="123 Main Street, New York, NY 10001" />
          </Field>
          <div className="bg-white/3 border border-white/6 rounded-xl p-4 text-xs text-white/40 font-mono leading-relaxed">
            <p className="text-white/25 text-[10px] uppercase tracking-wider mb-2">Preview</p>
            <p>{settings.footer_custom_text}</p>
            <p className="mt-1"><span className="text-orange-400/60">Unsubscribe</span> · {settings.footer_address}</p>
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

      {/* Default Inbox Profile Image */}
      <Section title="Default Inbox Profile Image" description="Applied to new inboxes that don't have their own image. Helps build sender trust.">
        <div className="flex items-center gap-5">
          {/* Avatar preview */}
          <div className="relative flex-shrink-0 group">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/8 border border-white/10 flex items-center justify-center">
              {defaultImage
                ? <img src={defaultImage} alt="Default inbox" className="w-full h-full object-cover" />
                : <svg className="w-7 h-7 text-white/25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              }
            </div>
            {/* Hover overlay */}
            <button
              onClick={() => { const el = document.getElementById("default-profile-upload"); el?.click(); }}
              className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            </button>
          </div>
          {/* Info + button */}
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-sm">
              {defaultImage ? "Default image set" : "No default image yet"}
            </p>
            <p className="text-white/30 text-xs mt-0.5">JPG, PNG, WebP or GIF · max 2 MB</p>
            <label
              htmlFor="default-profile-upload"
              className="mt-2.5 inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 border border-white/10 text-xs text-white/70 font-medium transition-colors"
            >
              {uploadingImage
                ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Uploading…</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg> {defaultImage ? "Change image" : "Upload image"}</>
              }
            </label>
            <input
              id="default-profile-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDefaultImageUpload(f); e.target.value = ""; }}
            />
            {imageError  && <p className="mt-1.5 text-red-400 text-xs">{imageError}</p>}
            {imageSaved  && <p className="mt-1.5 text-emerald-400 text-xs">Default image saved</p>}
          </div>
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

  // Capture payment params in state at mount — router.replace clears the URL
  // but we need the values to persist for the upgrade/success flow
  const [billingSuccess]       = useState(() => searchParams.get("billing") === "success");
  const [paidPlanId]           = useState(() => searchParams.get("plan") ?? undefined);
  const [paystackReference]    = useState(() => searchParams.get("reference") ?? searchParams.get("trxref") ?? undefined);
  const [creditPurchaseSuccess] = useState(() => searchParams.get("credit_purchase") === "success");

  // Clean up payment params from URL after mounting (keep tab=billing)
  useEffect(() => {
    if (billingSuccess || creditPurchaseSuccess) {
      router.replace("/settings?tab=billing");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(tab: Tab) {
    router.replace(`/settings?tab=${tab}`);
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Nav: horizontal scroll on mobile, vertical sidebar on md+ */}
      <nav className="flex-shrink-0 flex flex-row overflow-x-auto gap-0.5 border-b border-white/8 px-3 py-2 md:flex-col md:w-48 md:border-r md:border-b-0 md:p-4 md:space-y-0.5 md:overflow-x-visible">
        <p className="hidden md:block px-2 mb-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Settings</p>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            className={`flex-shrink-0 md:w-full md:text-left px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
              active === tab.id ? "bg-white/10 text-white font-medium" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${active !== "billing" ? "max-w-2xl" : ""}`}>
        {active === "profile"  && <ProfileTab />}
        {active === "security" && <SecurityTab />}
        {active === "team"     && <TeamTab />}
        {active === "billing"  && <BillingTab paymentSuccess={billingSuccess} paidPlanId={paidPlanId} paystackReference={paystackReference} creditPurchaseSuccess={creditPurchaseSuccess} />}
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
