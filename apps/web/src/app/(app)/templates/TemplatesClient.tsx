"use client";

/**
 * /templates — restyled to v2-app.
 *
 * Behaviour preserved:
 *   - getTemplates / createTemplate / deleteTemplate API calls unchanged
 *   - spam scorer wired into the create form
 *   - AI generation: POST /api/outreach/templates/generate with prompt + tone
 *
 * Visual change: Card grid for templates, Modal primitive for the create
 * flow, Hugeicons for the sparkle/delete/info icons.
 */

import { useEffect, useMemo, useState } from "react";
import { getTemplates, createTemplate, deleteTemplate } from "@/lib/outreach/api";
import type { OutreachTemplate } from "@/types/outreach";
import { scoreMessage, gradeColor, gradeBg } from "@/lib/outreach/spam-scorer";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Textarea,
  Select,
  Field,
  Modal,
  Icon,
  Badge,
} from "@/v2-app";
import {
  PlusSignIcon,
  SparklesIcon,
  Delete02Icon,
  Note01Icon,
  ArrowDown01Icon,
  AlertCircleIcon,
} from "@/v2-app/icons";
import "@/v2-app/v2-app.css";

const TONES = ["professional", "friendly", "direct", "casual"] as const;

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ name: "", subject: "", body: "" });

  const spamScore = useMemo(
    () => (form.subject || form.body) ? scoreMessage(form.subject, form.body) : null,
    [form.subject, form.body],
  );

  const [aiPrompt, setAiPrompt]   = useState("");
  const [aiTone, setAiTone]       = useState<typeof TONES[number]>("professional");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [showAi, setShowAi]       = useState(false);

  useEffect(() => { void load(); }, []);

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
    void load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    await deleteTemplate(id);
    void load();
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
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="app-h1">Email templates</h1>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Reusable email templates for campaign sequences.
            </p>
          </div>
          <Button variant="primary" iconLeft={PlusSignIcon} onClick={() => setShowNew(true)}>
            New template
          </Button>
        </header>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="app-skeleton" style={{ height: 78, borderRadius: "var(--app-radius-lg)" }} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card style={{ padding: 0 }}>
            <EmptyState
              icon={Note01Icon}
              title="No templates yet"
              body="Create reusable email templates to load into sequence steps."
              action={<Button variant="primary" iconLeft={PlusSignIcon} onClick={() => setShowNew(true)}>New template</Button>}
            />
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates.map(t => (
              <Card key={t.id} tight>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: "var(--app-text)", fontSize: 13, fontWeight: 500 }}>{t.name}</p>
                    <p style={{ color: "var(--app-text-muted)", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Subject: {t.subject}
                    </p>
                    <p style={{ color: "var(--app-text-quiet)", fontSize: 12, marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-line" }}>
                      {t.body}
                    </p>
                  </div>
                  <Button variant="danger" size="sm" iconLeft={Delete02Icon} onClick={() => handleDelete(t.id, t.name)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create modal */}
        <Modal open={showNew} onClose={resetModal} title="New template" maxWidth={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* AI panel */}
            <div
              style={{
                border: "1px solid var(--app-accent-line)",
                background: "var(--app-accent-soft)",
                borderRadius: "var(--app-radius)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setShowAi(v => !v)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--app-accent)",
                }}
              >
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: "rgba(249,115,22,0.18)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon icon={SparklesIcon} size={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, display: "block" }}>Generate with AI</span>
                  <span style={{ fontSize: 11, color: "rgba(249, 115, 22, 0.75)", display: "block", marginTop: 2 }}>
                    Describe your email and let AI write the subject &amp; body.
                  </span>
                </span>
                <span style={{ transform: showAi ? "rotate(180deg)" : undefined, transition: "transform 180ms var(--app-ease)" }}>
                  <Icon icon={ArrowDown01Icon} size={14} />
                </span>
              </button>

              {showAi && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--app-accent-line)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ paddingTop: 12 }}>
                    <Field label="Describe your email">
                      <Textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g. Cold outreach to SaaS founders offering a lead generation tool that finds verified B2B emails"
                      />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <Field label="Tone">
                        <Select value={aiTone} onChange={e => setAiTone(e.target.value as typeof TONES[number])}>
                          {TONES.map(t => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleAiGenerate}
                      disabled={!aiPrompt.trim() || aiLoading}
                      iconLeft={SparklesIcon}
                    >
                      {aiLoading ? "Generating…" : "Generate"}
                    </Button>
                  </div>

                  {aiError && (
                    <div
                      role="alert"
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "8px 12px", borderRadius: "var(--app-radius-sm)",
                        background: "var(--app-danger-soft)",
                        border: "1px solid rgba(248, 113, 113, 0.30)",
                        color: "var(--app-danger)", fontSize: 12,
                      }}
                    >
                      <Icon icon={AlertCircleIcon} size={13} />
                      <span>{aiError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Spam score */}
            {spamScore && (
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: "var(--app-radius-sm)",
                  border: "1px solid var(--app-border)",
                }}
                className={gradeBg(spamScore.grade)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={gradeColor(spamScore.grade)} style={{ fontSize: 11, fontWeight: 600 }}>Grade {spamScore.grade}</span>
                  <span style={{ color: "var(--app-text-quiet)", fontSize: 11 }}>·</span>
                  <span style={{ color: "var(--app-text-muted)", fontSize: 11 }}>Spam score {spamScore.score}/10</span>
                </span>
                {spamScore.issues.length > 0 && (
                  <Badge tone="warning">{spamScore.issues.length} issue{spamScore.issues.length !== 1 ? "s" : ""}</Badge>
                )}
              </div>
            )}
            {spamScore && spamScore.issues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {spamScore.issues.map((issue, i) => (
                  <p key={i} style={{ color: "var(--app-warning)", fontSize: 11, display: "flex", gap: 6 }}>
                    <span>⚠</span>
                    <span>{issue.label}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Manual fields */}
            <Field label="Template name" required>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cold intro — contractor"
              />
            </Field>
            <Field label="Subject" required>
              <Input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Quick question for {{first_name}}"
              />
            </Field>
            <Field
              label="Body"
              required
              helper={`Variables: {{first_name}}  {{last_name}}  {{company}}  {{title}}`}
            >
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={8}
                placeholder={"Hi {{first_name}},\n\nI wanted to reach out…"}
                style={{ fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace" }}
              />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={resetModal} style={{ flex: 1, justifyContent: "center" }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={!form.name || !form.subject || !form.body || saving}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {saving ? "Saving…" : "Save template"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
