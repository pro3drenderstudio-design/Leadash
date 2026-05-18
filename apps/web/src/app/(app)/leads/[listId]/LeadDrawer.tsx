"use client";

import { useEffect, useState } from "react";
import { type Lead, VERIFY_BADGE } from "./ListDetailClient";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-white/25 text-xs w-20 shrink-0 pt-0.5 font-medium">{label}</span>
      <div className="flex-1 min-w-0 text-white/70 text-sm">{children}</div>
    </div>
  );
}

export default function LeadDrawer({
  lead,
  listId,
  onClose,
  onDelete,
  onUpdate,
}: {
  lead:     Lead;
  listId:   string;
  onClose:  () => void;
  onDelete: () => void;
  onUpdate: (updated: Lead) => void;
}) {
  const [editFL,    setEditFL]    = useState(lead.first_line ?? "");
  const [savingFL,  setSavingFL]  = useState(false);
  const [savedFL,   setSavedFL]   = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [delConfirm,setDelConfirm]= useState(false);

  // Sync first_line when lead changes (e.g. after table refresh)
  useEffect(() => { setEditFL(lead.first_line ?? ""); }, [lead.id, lead.first_line]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const name     = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
  const initials = [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join("").toUpperCase()
                   || lead.email[0].toUpperCase();
  const badge    = VERIFY_BADGE[lead.verification_status ?? ""];

  // Extract phone/linkedin from custom_fields
  const extraFields: { key: string; value: string }[] = [];
  if (lead.custom_fields) {
    for (const [k, v] of Object.entries(lead.custom_fields)) {
      const lk = k.toLowerCase();
      if (["phone","linkedin","linkedin_url","twitter","instagram"].includes(lk) && v) {
        extraFields.push({ key: k, value: String(v) });
      }
    }
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(lead.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveFL = async () => {
    setSavingFL(true);
    await fetch(`/api/outreach/lists/${listId}/leads/first-lines`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates: [{ id: lead.id, first_line: editFL }] }),
    });
    setSavingFL(false);
    setSavedFL(true);
    setTimeout(() => setSavedFL(false), 2000);
    onUpdate({ ...lead, first_line: editFL || null });
  };

  const handleDelete = async () => {
    await fetch(`/api/outreach/lists/${listId}/leads`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids: [lead.id] }),
    });
    onDelete();
  };

  const flChanged = editFL !== (lead.first_line ?? "");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0d0d0d] border-l border-white/8 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/8 shrink-0">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">{name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-white/40 text-xs truncate">{lead.email}</span>
              <button
                onClick={copyEmail}
                className="text-white/25 hover:text-white/60 transition-colors text-xs shrink-0"
                title="Copy email"
              >
                {copied ? "✓" : "⎘"}
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/25 hover:text-white/65 transition-colors shrink-0 mt-0.5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Contact info */}
          <div className="space-y-3">
            {lead.title && <Field label="Title">{lead.title}</Field>}
            {lead.company && <Field label="Company">{lead.company}</Field>}
            {lead.website && (
              <Field label="Website">
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 hover:underline truncate block transition-colors"
                >
                  {lead.website}
                </a>
              </Field>
            )}
            {extraFields.map(f => (
              <Field key={f.key} label={f.key.charAt(0).toUpperCase() + f.key.slice(1)}>
                {f.value.startsWith("http") ? (
                  <a href={f.value} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate block">
                    {f.value}
                  </a>
                ) : (
                  <span>{f.value}</span>
                )}
              </Field>
            ))}
          </div>

          {/* Verification */}
          <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Verification</p>
            <div className="flex items-center gap-3">
              {badge ? (
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              ) : (
                <span className="text-white/25 text-sm">Not verified</span>
              )}
              {lead.verification_score != null && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, lead.verification_score)}%` }}
                      className={`h-full rounded-full transition-all ${
                        lead.verification_score >= 70 ? "bg-emerald-500" :
                        lead.verification_score >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                  <span className="text-white/40 text-xs shrink-0">{Math.round(lead.verification_score)}</span>
                </div>
              )}
            </div>
            {lead.verified_at && (
              <p className="text-white/20 text-xs">
                Verified {new Date(lead.verified_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          {/* AI First Line */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">AI First Line</p>
            <textarea
              value={editFL}
              onChange={e => setEditFL(e.target.value)}
              placeholder="No first line yet — select this lead and use ✨ Generate First Lines"
              rows={3}
              className="w-full bg-white/[0.04] border border-white/8 hover:border-white/14 focus:border-white/22 rounded-xl px-3 py-2.5 text-sm text-white/75 placeholder:text-white/18 focus:outline-none resize-none transition-colors"
            />
            {flChanged && (
              <button
                onClick={handleSaveFL}
                disabled={savingFL}
                className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-50 text-violet-400 text-xs font-semibold rounded-lg border border-violet-500/20 transition-colors"
              >
                {savedFL ? "✓ Saved" : savingFL ? "Saving…" : "Save"}
              </button>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Details</p>
            <div className="bg-white/[0.03] rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  lead.status === "active"      ? "bg-emerald-500/12 text-emerald-400" :
                  lead.status === "bounced"     ? "bg-red-500/12 text-red-400" :
                  lead.status === "unsubscribed"? "bg-orange-500/12 text-orange-400" :
                  "bg-white/8 text-white/40"
                }`}>
                  {lead.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">Added</span>
                <span className="text-white/45 text-xs">
                  {new Date(lead.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/8 flex items-center gap-2 shrink-0">
          <button
            onClick={copyEmail}
            className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.07] text-white/55 hover:text-white/80 text-sm rounded-xl border border-white/8 hover:border-white/15 transition-colors"
          >
            {copied ? "✓ Copied" : "Copy email"}
          </button>
          {delConfirm ? (
            <div className="flex gap-1.5">
              <button onClick={() => setDelConfirm(false)} className="px-3 py-2 text-white/40 hover:text-white/70 text-sm border border-white/8 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold rounded-xl border border-red-500/20 transition-colors">
                Confirm
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDelConfirm(true)}
              className="px-3 py-2 bg-red-500/8 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 text-sm rounded-xl border border-red-500/12 hover:border-red-500/20 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
