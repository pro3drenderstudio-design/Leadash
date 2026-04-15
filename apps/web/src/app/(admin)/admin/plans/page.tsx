"use client";
import { useEffect, useState, useCallback } from "react";

interface PlanConfig {
  plan_id:                 string;
  name:                    string;
  sort_order:              number;
  price_ngn:               number;
  price_usd:               number;
  paystack_plan_code:      string | null;
  stripe_price_id:         string | null;
  max_inboxes:             number;
  max_monthly_sends:       number;
  max_seats:               number;
  max_leads_pool:          number;
  included_credits:        number;
  trial_days:              number;
  inbox_monthly_price_ngn: number;
  can_scrape_leads:        boolean;
  can_run_campaigns:       boolean;
  feat_warmup:             boolean;
  feat_preview_leads:      boolean;
  feat_ai_personalization: boolean;
  feat_ai_classification:  boolean;
  feat_api_access:         boolean;
  is_active:               boolean;
  updated_at:              string;
}

type EditState = Partial<PlanConfig>;

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-blue-500" : "bg-slate-300 dark:bg-white/20"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function NumInput({ value, onChange, min, placeholder }: {
  value: number; onChange: (v: number) => void; min?: number; placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      placeholder={placeholder}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30 tabular-nums"
    />
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder ?? ""}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
    />
  );
}

const FEAT_LABELS: { key: keyof PlanConfig; label: string }[] = [
  { key: "feat_warmup",              label: "Warmup" },
  { key: "feat_preview_leads",       label: "Preview Leads" },
  { key: "feat_ai_personalization",  label: "AI Personalization" },
  { key: "feat_ai_classification",   label: "AI Classification" },
  { key: "feat_api_access",          label: "API Access" },
  { key: "can_scrape_leads",         label: "Scrape Leads" },
  { key: "can_run_campaigns",        label: "Run Campaigns" },
];

function PlanCard({
  plan,
  onSave,
}: {
  plan: PlanConfig;
  onSave: (planId: string, edits: EditState) => Promise<{ warning?: string }>;
}) {
  const [edits, setEdits]     = useState<EditState>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const merged = { ...plan, ...edits } as PlanConfig;

  function set<K extends keyof PlanConfig>(key: K, value: PlanConfig[K]) {
    setEdits(e => ({ ...e, [key]: value }));
  }

  const isDirty = Object.keys(edits).length > 0;

  async function handleSave() {
    setSaving(true);
    setWarning(null);
    const result = await onSave(plan.plan_id, edits);
    setSaving(false);
    if (result.warning) setWarning(result.warning);
    setSaved(true);
    setEdits({});
    setTimeout(() => setSaved(false), 3000);
  }

  function handleDiscard() {
    setEdits({});
    setWarning(null);
  }

  const fmtLimit = (v: number) => v === -1 ? "∞" : v.toLocaleString();

  return (
    <div className={`bg-white dark:bg-white/5 border rounded-2xl overflow-hidden transition-all ${
      isDirty ? "border-blue-400 dark:border-blue-500/60 ring-1 ring-blue-400/30" : "border-slate-200 dark:border-white/10"
    }`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={merged.name}
            onChange={e => set("name", e.target.value)}
            className="text-base font-bold text-slate-800 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-white/20 focus:border-blue-400 focus:outline-none transition-colors"
          />
          <span className="text-xs text-slate-400 dark:text-white/30 font-mono">{plan.plan_id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-white/30">
            {merged.is_active ? "Visible to users" : "Hidden"}
          </span>
          <Toggle checked={merged.is_active} onChange={v => set("is_active", v)} />
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Pricing */}
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider mb-3">Pricing</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Price (₦)</label>
              <NumInput value={merged.price_ngn} onChange={v => set("price_ngn", v)} min={0} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Price (USD display)</label>
              <NumInput value={merged.price_usd} onChange={v => set("price_usd", v)} min={0} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Inbox price (₦/mailbox/mo)</label>
              <NumInput value={merged.inbox_monthly_price_ngn} onChange={v => set("inbox_monthly_price_ngn", v)} min={0} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Trial days</label>
              <NumInput value={merged.trial_days} onChange={v => set("trial_days", v)} min={0} />
            </div>
          </div>
        </div>

        {/* Limits */}
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider mb-3">
            Limits <span className="normal-case font-normal text-slate-400">(-1 = unlimited)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "max_inboxes"        as const, label: "Max inboxes",      current: fmtLimit(plan.max_inboxes) },
              { key: "max_monthly_sends"  as const, label: "Max sends/mo",     current: fmtLimit(plan.max_monthly_sends) },
              { key: "max_seats"          as const, label: "Max seats",        current: fmtLimit(plan.max_seats) },
              { key: "max_leads_pool"     as const, label: "Leads pool",       current: fmtLimit(plan.max_leads_pool) },
              { key: "included_credits"   as const, label: "Included credits", current: plan.included_credits.toLocaleString() },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">{label}</label>
                <NumInput value={merged[key] as number} onChange={v => set(key, v)} />
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider mb-3">Features</p>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
            {FEAT_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-sm text-slate-600 dark:text-white/70">{label}</span>
                <Toggle
                  checked={merged[key] as boolean}
                  onChange={v => set(key, v)}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Paystack / Stripe codes */}
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider mb-3">Payment Integration</p>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Paystack Plan Code</label>
              <TextInput
                value={merged.paystack_plan_code ?? ""}
                onChange={v => set("paystack_plan_code", v || null)}
                placeholder="PLN_xxxxxxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-white/50 mb-1">Stripe Price ID</label>
              <TextInput
                value={merged.stripe_price_id ?? ""}
                onChange={v => set("stripe_price_id", v || null)}
                placeholder="price_xxxxxxxxxxxx"
              />
            </div>
          </div>
        </div>

        {/* Warnings */}
        {warning && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">Saved to DB</span> but Paystack sync failed: {warning}
            </p>
          </div>
        )}

        {/* Actions */}
        {isDirty && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleDiscard}
              className="text-sm text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save & Sync"}
            </button>
          </div>
        )}

        {saved && !isDirty && (
          <p className="text-xs text-green-600 dark:text-green-400 text-right">
            ✓ Saved — live immediately
            {!warning && merged.paystack_plan_code && " · Paystack synced"}
          </p>
        )}

        <p className="text-[11px] text-slate-300 dark:text-white/20">
          Last updated {new Date(plan.updated_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans]   = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchPlans = useCallback(() => {
    fetch("/api/admin/plans")
      .then(r => r.json())
      .then(d => { setPlans(d.plans ?? []); setLoading(false); })
      .catch(() => { setError("Failed to load plans"); setLoading(false); });
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  async function handleSave(planId: string, edits: EditState): Promise<{ warning?: string }> {
    const res = await fetch(`/api/admin/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edits),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Save failed");
      return { warning: data.error };
    }
    // Update local state
    setPlans(prev => prev.map(p => p.plan_id === planId ? { ...p, ...edits, updated_at: new Date().toISOString() } : p));
    return { warning: data.warnings?.[0] };
  }

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-32 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-96 bg-slate-200 dark:bg-white/10 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Plans</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">
          Changes take effect sitewide immediately. Price changes sync to Paystack automatically.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        <strong>Existing subscribers</strong> stay at their current price until they cancel and re-subscribe. New subscribers get the updated price immediately.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans.map(plan => (
          <PlanCard key={plan.plan_id} plan={plan} onSave={handleSave} />
        ))}
      </div>
    </div>
  );
}
