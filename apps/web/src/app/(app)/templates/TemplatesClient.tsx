"use client";
import { useEffect, useState } from "react";
import { getTemplates, createTemplate, deleteTemplate } from "@/lib/outreach/api";
import type { OutreachTemplate } from "@/types/outreach";

const TONES = ["professional", "friendly", "direct", "casual"] as const;

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ name: "", subject: "", body: "" });

  // AI generation state
  const [aiPrompt, setAiPrompt]   = useState("");
  const [aiTone, setAiTone]       = useState<typeof TONES[number]>("professional");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [showAi, setShowAi]       = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setTemplates(await getTemplates());
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name || !form.subject || !form.body) return;
    setSaving(true);
    await createTemplate(form.name, form.subject, form.body);
    setForm({ name: "", subject: "", body: "" });
    setShowNew(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    await deleteTemplate(id);
    load();
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) return;
    setAiError("");
    setAiLoading(true);
    try {
      const res = await fetch("/api/outreach/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, tone: aiTone }),
      });
      const data = await res.json() as { subject?: string; body?: string; error?: string };
      if (!res.ok || data.error) { setAiError(data.error ?? "Failed to generate"); return; }
      setForm(f => ({ ...f, subject: data.subject ?? f.subject, body: data.body ?? f.body }));
      setShowAi(false);
      setAiPrompt("");
    } catch {
      setAiError("Network error — please try again");
    } finally {
      setAiLoading(false);
    }
  }

  function resetModal() {
    setShowNew(false);
    setShowAi(false);
    setAiPrompt("");
    setAiError("");
    setForm({ name: "", subject: "", body: "" });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Email Templates</h1>
          <p className="text-white/40 text-sm mt-0.5">Reusable email templates for campaign sequences</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          + New Template
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-4xl mb-4">📝</div>
          <p className="font-medium">No templates yet</p>
          <p className="text-sm mt-1">Create reusable email templates to load into sequence steps</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white/4 border border-white/8 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium text-sm">{t.name}</p>
                  <p className="text-white/50 text-xs mt-0.5 truncate">Subject: {t.subject}</p>
                  <p className="text-white/30 text-xs mt-1 line-clamp-2 whitespace-pre-line">{t.body}</p>
                </div>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New template modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
              <h2 className="text-white font-semibold">New Template</h2>
              <button onClick={resetModal} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* AI Generate panel */}
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden">
                <button
                  onClick={() => setShowAi(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-500/10 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-orange-300 text-sm font-semibold">Generate with AI</p>
                    <p className="text-orange-400/60 text-xs">Describe your email and let AI write the subject &amp; body</p>
                  </div>
                  <svg className={`w-4 h-4 text-orange-400/60 transition-transform ${showAi ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showAi && (
                  <div className="px-4 pb-4 space-y-3 border-t border-orange-500/15">
                    <div className="pt-3">
                      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Describe your email</label>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g. Cold outreach to SaaS founders offering a lead generation tool that finds verified B2B emails"
                        className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50 resize-none"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Tone</label>
                        <select
                          value={aiTone}
                          onChange={e => setAiTone(e.target.value as typeof TONES[number])}
                          className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50 capitalize"
                        >
                          {TONES.map(t => <option key={t} value={t} className="bg-[#1a1a1a] capitalize">{t}</option>)}
                        </select>
                      </div>
                      <div className="flex-shrink-0 pt-5">
                        <button
                          onClick={handleAiGenerate}
                          disabled={!aiPrompt.trim() || aiLoading}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                        >
                          {aiLoading ? (
                            <>
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              Generating…
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Generate
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {aiError && (
                      <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{aiError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Manual fields */}
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Template Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Cold intro — contractor"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Subject</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Quick question for {{first_name}}"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={8}
                  placeholder={"Hi {{first_name}},\n\nI wanted to reach out…"}
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50 resize-y font-mono"
                />
                <p className="text-white/25 text-xs mt-1">Variables: {"{{first_name}}"} {"{{last_name}}"} {"{{company}}"} {"{{title}}"}</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={resetModal}
                  className="flex-1 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name || !form.subject || !form.body || saving}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {saving ? "Saving…" : "Save Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
