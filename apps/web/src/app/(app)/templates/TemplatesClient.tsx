"use client";
import { useEffect, useState } from "react";
import { getTemplates, createTemplate, deleteTemplate } from "@/lib/outreach/api";
import type { OutreachTemplate } from "@/types/outreach";

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ name: "", subject: "", body: "" });

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Email Templates</h1>
          <p className="text-white/40 text-sm mt-0.5">Reusable email templates for campaign sequences</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
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
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="text-white font-semibold">New Template</h2>
              <button onClick={() => setShowNew(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Template Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Cold intro — contractor"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Subject</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Quick question for {{first_name}}"
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={8}
                  placeholder={"Hi {{first_name}},\n\nI wanted to reach out…"}
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-500/50 resize-y font-mono"
                />
                <p className="text-white/25 text-xs mt-1">Variables: {"{{first_name}}"} {"{{last_name}}"} {"{{company}}"} {"{{title}}"}</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowNew(false)}
                  className="flex-1 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name || !form.subject || !form.body || saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
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
