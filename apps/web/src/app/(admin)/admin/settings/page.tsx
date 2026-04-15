"use client";
import { useEffect, useState } from "react";

interface AnnouncementBanner {
  active: boolean;
  text: string;
  color: "blue" | "green" | "amber" | "red";
}

interface Settings {
  maintenance_mode:       boolean;
  announcement_banner:    AnnouncementBanner;
  signup_enabled:         boolean;
  trial_days:             number;
  default_plan:           string;
  lead_credits_on_signup: number;
  support_email:          string;
}

interface Meta {
  updated_at: string;
  updated_by: string | null;
}

const PLAN_OPTIONS = ["free", "starter", "growth", "scale"];
const BANNER_COLOR_OPTIONS: AnnouncementBanner["color"][] = ["blue", "green", "amber", "red"];

const BANNER_COLOR_PREVIEW: Record<string, string> = {
  blue:  "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300",
  green: "bg-green-50 border-green-200 text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-300",
  amber: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300",
  red:   "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
        checked ? "bg-blue-500" : "bg-slate-300 dark:bg-white/20"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2>
      <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">{description}</p>
    </div>
  );
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8 py-4 border-b border-slate-100 dark:border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-white/80">{label}</p>
        {description && <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
        saved
          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
          : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
      }`}
    >
      {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
    </button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [meta, setMeta]         = useState<Record<string, Meta>>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Per-section save state
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [savedSection, setSavedSection]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setSettings(d.settings as Settings);
        setMeta(d.meta);
        setLoading(false);
      })
      .catch(() => setError("Failed to load settings"));
  }, []);

  async function save(section: string, patch: Partial<Settings>) {
    setSavingSection(section);
    setSavedSection(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSavingSection(null);
    if (!res.ok) { alert(data.error ?? "Save failed"); return; }
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2500);
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function updateBanner<K extends keyof AnnouncementBanner>(key: K, value: AnnouncementBanner[K]) {
    setSettings(prev => {
      if (!prev) return prev;
      return { ...prev, announcement_banner: { ...prev.announcement_banner, [key]: value } };
    });
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !settings) {
    return <div className="p-8 text-red-500">{error ?? "Unknown error"}</div>;
  }

  const lastUpdated = (key: string) => {
    const m = meta[key];
    if (!m?.updated_at) return null;
    return new Date(m.updated_at).toLocaleDateString();
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Settings</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">Global configuration for all workspaces.</p>
      </div>

      {/* ── General ── */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <SectionHeader
          title="General"
          description="Platform-wide on/off switches."
        />
        <FieldRow
          label="Maintenance mode"
          description="Shows a maintenance page to all non-admin users."
        >
          <div className="flex items-center gap-3">
            {settings.maintenance_mode && (
              <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Active</span>
            )}
            <Toggle checked={settings.maintenance_mode} onChange={v => update("maintenance_mode", v)} />
          </div>
        </FieldRow>
        <FieldRow
          label="New signups"
          description="Allow new users to create accounts."
        >
          <Toggle checked={settings.signup_enabled} onChange={v => update("signup_enabled", v)} />
        </FieldRow>
        <div className="pt-4 flex justify-between items-center">
          {lastUpdated("maintenance_mode") && (
            <p className="text-xs text-slate-400 dark:text-white/30">Last saved {lastUpdated("maintenance_mode")}</p>
          )}
          <SaveButton
            saving={savingSection === "general"}
            saved={savedSection === "general"}
            onClick={() => save("general", {
              maintenance_mode: settings.maintenance_mode,
              signup_enabled:   settings.signup_enabled,
            })}
          />
        </div>
      </div>

      {/* ── Announcement Banner ── */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <SectionHeader
          title="Announcement Banner"
          description="Shows a dismissible banner at the top of the app for all users."
        />
        <FieldRow label="Enable banner">
          <Toggle
            checked={settings.announcement_banner.active}
            onChange={v => updateBanner("active", v)}
          />
        </FieldRow>
        <FieldRow label="Message" description="The text shown in the banner.">
          <input
            type="text"
            value={settings.announcement_banner.text}
            onChange={e => updateBanner("text", e.target.value)}
            placeholder="e.g. We'll be down for maintenance on Saturday…"
            className="w-72 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </FieldRow>
        <FieldRow label="Color">
          <div className="flex gap-2">
            {BANNER_COLOR_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => updateBanner("color", c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  settings.announcement_banner.color === c
                    ? "border-slate-700 dark:border-white scale-110"
                    : "border-transparent"
                } ${
                  c === "blue"  ? "bg-blue-400"  :
                  c === "green" ? "bg-green-400" :
                  c === "amber" ? "bg-amber-400" :
                                  "bg-red-400"
                }`}
              />
            ))}
          </div>
        </FieldRow>
        {/* Preview */}
        {settings.announcement_banner.text && (
          <div className={`mt-4 rounded-lg border px-4 py-2.5 text-sm font-medium ${BANNER_COLOR_PREVIEW[settings.announcement_banner.color]}`}>
            {settings.announcement_banner.active ? "Preview: " : "Preview (inactive): "}
            {settings.announcement_banner.text}
          </div>
        )}
        <div className="pt-4 flex justify-end">
          <SaveButton
            saving={savingSection === "banner"}
            saved={savedSection === "banner"}
            onClick={() => save("banner", { announcement_banner: settings.announcement_banner })}
          />
        </div>
      </div>

      {/* ── Onboarding & Trials ── */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <SectionHeader
          title="Onboarding & Trials"
          description="Controls for new workspace defaults."
        />
        <FieldRow label="Default plan" description="Plan assigned to new workspaces on signup.">
          <select
            value={settings.default_plan}
            onChange={e => update("default_plan", e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Trial days" description="Duration of the free trial for new workspaces.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={365}
              value={settings.trial_days}
              onChange={e => update("trial_days", parseInt(e.target.value) || 0)}
              className="w-20 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-right"
            />
            <span className="text-sm text-slate-400 dark:text-white/30">days</span>
          </div>
        </FieldRow>
        <FieldRow label="Free credits on signup" description="Lead credits automatically granted to new workspaces.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={settings.lead_credits_on_signup}
              onChange={e => update("lead_credits_on_signup", parseInt(e.target.value) || 0)}
              className="w-24 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-right"
            />
            <span className="text-sm text-slate-400 dark:text-white/30">credits</span>
          </div>
        </FieldRow>
        <div className="pt-4 flex justify-end">
          <SaveButton
            saving={savingSection === "onboarding"}
            saved={savedSection === "onboarding"}
            onClick={() => save("onboarding", {
              default_plan:           settings.default_plan,
              trial_days:             settings.trial_days,
              lead_credits_on_signup: settings.lead_credits_on_signup,
            })}
          />
        </div>
      </div>

      {/* ── Support ── */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <SectionHeader
          title="Support"
          description="Email settings for support ticket notifications."
        />
        <FieldRow label="Support email" description="Reply-to address for ticket notification emails.">
          <input
            type="email"
            value={settings.support_email}
            onChange={e => update("support_email", e.target.value)}
            className="w-64 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </FieldRow>
        <div className="pt-4 flex justify-end">
          <SaveButton
            saving={savingSection === "support"}
            saved={savedSection === "support"}
            onClick={() => save("support", { support_email: settings.support_email })}
          />
        </div>
      </div>

    </div>
  );
}
