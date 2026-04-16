"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getInboxes, getLists, createCampaign, saveSequence, enrollLeads, getTemplates, generateSequence, sendTestEmail, checkInboxDns } from "@/lib/outreach/api";
import type { CampaignEnrollmentRow } from "@/types/outreach";
import type { OutreachInboxSafe, OutreachList, OutreachTemplate } from "@/types/outreach";

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
type Step = {
  type: "email" | "wait";
  wait_days: number;
  subject_template: string;
  subject_template_b: string;
  body_template: string;
};

export default function CampaignWizardClient() {
  const router = useRouter();
  const [step, setStep]       = useState(0);
  const [inboxes, setInboxes] = useState<OutreachInboxSafe[]>([]);
  const [lists, setLists]     = useState<OutreachList[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);

  // Step 1 fields
  const [name, setName]             = useState("");
  const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
  const [timezone, setTimezone]     = useState("America/New_York");
  const [sendDays, setSendDays]     = useState<string[]>(["mon","tue","wed","thu","fri"]);
  const [startTime, setStartTime]   = useState("09:00");
  const [endTime, setEndTime]       = useState("17:00");
  const [dailyCap, setDailyCap]     = useState(100);
  const [minDelay, setMinDelay]     = useState(30);
  const [maxDelay, setMaxDelay]     = useState(120);
  const [stopOnReply, setStopOnReply]     = useState(true);
  const [pauseAfterOpen, setPauseAfterOpen] = useState(false);

  // Step 2 fields
  const [selectedLists, setSelectedLists] = useState<string[]>([]);

  // Step 3 fields
  const [seqSteps, setSeqSteps] = useState<Step[]>([
    { type: "email", wait_days: 0, subject_template: "Quick question, {{first_name}}", subject_template_b: "", body_template: "Hi {{first_name}},\n\nI noticed {{company}} and wanted to reach out…\n\nBest,\n[Your Name]" },
    { type: "wait",  wait_days: 3, subject_template: "", subject_template_b: "", body_template: "" },
    { type: "email", wait_days: 0, subject_template: "Following up", subject_template_b: "", body_template: "Hi {{first_name}}, just wanted to follow up on my previous email…\n\nBest," },
  ]);
  const [loadingTemplate, setLoadingTemplate] = useState<number | null>(null);

  // AI sequence generator
  const [showAiGen, setShowAiGen]       = useState(false);
  const [aiProduct, setAiProduct]       = useState("");
  const [aiAudience, setAiAudience]     = useState("");
  const [aiValueProp, setAiValueProp]   = useState("");
  const [aiTone, setAiTone]             = useState("professional");
  const [aiNumEmails, setAiNumEmails]   = useState(3);
  const [aiWaitDays, setAiWaitDays]     = useState(3);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);

  // Test email modal
  const [testStepIdx, setTestStepIdx]         = useState<number | null>(null);
  const [testInboxId, setTestInboxId]         = useState("");
  const [testInboxOpen, setTestInboxOpen]     = useState(false);
  const [testToEmail, setTestToEmail]         = useState("");
  const [testSending, setTestSending]         = useState(false);
  const [testResult, setTestResult]           = useState<string | null>(null);
  const [testPreviewTab, setTestPreviewTab]   = useState<"preview" | "plain">("preview");
  const [testSampleLeads, setTestSampleLeads] = useState<CampaignEnrollmentRow[]>([]);
  const [testSampleIdx, setTestSampleIdx]     = useState<number>(-1);
  const [testDns, setTestDns]                 = useState<Awaited<ReturnType<typeof checkInboxDns>> | null>(null);
  const [testDnsLoading, setTestDnsLoading]   = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getInboxes(), getLists(), getTemplates()]).then(([i, l, t]) => {
      setInboxes(i); setLists(l); setTemplates(t);
    });
  }, []);

  function toggleInbox(id: string) {
    setSelectedInboxes((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleList(id: string) {
    setSelectedLists((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleDay(d: string) {
    setSendDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  function addStep(type: "email" | "wait") {
    setSeqSteps((s) => [...s, {
      type,
      wait_days: type === "wait" ? 3 : 0,
      subject_template: type === "email" ? "Following up again" : "",
      subject_template_b: "",
      body_template: type === "email" ? "Hi {{first_name}},\n\n" : "",
    }]);
  }
  function removeStep(i: number) { setSeqSteps((s) => s.filter((_, idx) => idx !== i)); }
  function updateStep(i: number, field: keyof Step, value: string | number) {
    setSeqSteps((s) => s.map((st, idx) => idx === i ? { ...st, [field]: value } : st));
  }
  function loadTemplate(stepIdx: number, template: OutreachTemplate) {
    setSeqSteps((s) => s.map((st, idx) => idx === stepIdx
      ? { ...st, subject_template: template.subject, body_template: template.body }
      : st));
    setLoadingTemplate(null);
  }

  async function handleAiGenerate() {
    if (!aiProduct || !aiAudience || !aiValueProp) {
      setAiError("Product, audience, and value prop are required");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const result = await generateSequence({
        product_name: aiProduct,
        target_audience: aiAudience,
        value_prop: aiValueProp,
        tone: aiTone,
        num_emails: aiNumEmails,
        wait_days_between: aiWaitDays,
      });
      if (result.error) { setAiError(result.error); return; }
      if (result.steps) {
        setSeqSteps(result.steps.map((s: { type: string; subject?: string; body?: string; wait_days?: number }) => ({
          type: s.type as "email" | "wait",
          wait_days: s.wait_days ?? aiWaitDays,
          subject_template: s.subject ?? "",
          subject_template_b: "",
          body_template: s.body ?? "",
        })));
        setShowAiGen(false);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiGenerating(false);
    }
  }

  function renderTemplate(tpl: string, lead: CampaignEnrollmentRow["lead"] | null): string {
    const vars: Record<string, string> = {
      first_name: lead?.first_name ?? "Jane",
      last_name:  lead?.last_name  ?? "Smith",
      company:    lead?.company    ?? "Acme Corp",
      title:      lead?.title      ?? "Manager",
      email:      lead?.email      ?? "jane@acme.com",
    };
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  }

  async function handleCheckDns() {
    if (!testInboxId) return;
    setTestDnsLoading(true);
    setTestDns(null);
    const result = await checkInboxDns(testInboxId).catch(e => ({ error: e.message } as never));
    setTestDns(result);
    setTestDnsLoading(false);
  }

  async function handleTestSend() {
    if (testStepIdx === null) return;
    if (!testInboxId || !testToEmail) {
      setTestResult("Error: Inbox and recipient email are required");
      return;
    }
    const s = seqSteps[testStepIdx];
    const sampleLead = testSampleIdx >= 0 ? testSampleLeads[testSampleIdx]?.lead : null;
    setTestSending(true);
    setTestResult(null);
    const res = await sendTestEmail({
      inbox_id: testInboxId,
      to_email: testToEmail,
      subject_template: s.subject_template,
      body_template: s.body_template,
      lead_id: sampleLead?.id || undefined,
    });
    setTestSending(false);
    setTestResult(res.message ?? (res.error ? `Error: ${res.error}` : "Sent! Check your inbox."));
  }

  async function handleFinish() {
    if (!name.trim())             { setError("Campaign name is required"); return; }
    if (!selectedInboxes.length)  { setError("Select at least one inbox"); return; }
    if (!selectedLists.length)    { setError("Select at least one lead list"); return; }
    if (!seqSteps.some((s) => s.type === "email")) { setError("Add at least one email step"); return; }

    setSaving(true); setError(null);

    const campaign = await createCampaign({
      name, inbox_ids: selectedInboxes, list_ids: selectedLists,
      timezone, send_days: sendDays, send_start_time: startTime,
      send_end_time: endTime, daily_cap: dailyCap,
      min_delay_seconds: minDelay, max_delay_seconds: maxDelay,
      stop_on_reply: stopOnReply, pause_after_open: pauseAfterOpen,
    });

    if ((campaign as unknown as { error?: string }).error) {
      setError((campaign as unknown as { error: string }).error);
      setSaving(false);
      return;
    }

    await saveSequence(campaign.id, seqSteps.map((s) => ({
      ...s,
      subject_template_b: s.subject_template_b || null,
    })));
    await enrollLeads(campaign.id, selectedLists);

    router.push(`/campaigns/${campaign.id}?enrolled=1`);
  }

  const STEP_LABELS = ["Settings", "Leads", "Sequence", "Review"];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${i <= step ? "bg-orange-500 border-orange-500 text-white" : "bg-white/6 border-white/10 text-white/30"}`}>{i + 1}</div>
            <span className={`text-sm ${i === step ? "text-white font-medium" : "text-white/30"}`}>{label}</span>
            {i < 3 && <div className="w-8 h-px bg-white/10 mx-1" />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}

      {/* Step 0: Settings */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Campaign Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q2 Real Estate Outreach" className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/50" />
          </div>

          {/* Inboxes — scrollable */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Sending Inboxes {selectedInboxes.length > 0 && <span className="text-orange-400 normal-case ml-1">{selectedInboxes.length} selected</span>}
            </label>
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {inboxes.map((inbox) => {
                const warmupEndsAt = (inbox as OutreachInboxSafe & { warmup_ends_at?: string }).warmup_ends_at;
                const isWarming    = !!warmupEndsAt && new Date(warmupEndsAt) > new Date();
                const daysLeft     = isWarming ? Math.ceil((new Date(warmupEndsAt!).getTime() - Date.now()) / 86_400_000) : 0;
                return (
                  <label key={inbox.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isWarming ? "border-white/5 bg-white/2 cursor-not-allowed opacity-60" : `cursor-pointer ${selectedInboxes.includes(inbox.id) ? "border-orange-500/40 bg-orange-500/10" : "border-white/8 bg-white/3 hover:bg-white/5"}`}`}>
                    <input type="checkbox" disabled={isWarming} checked={!isWarming && selectedInboxes.includes(inbox.id)} onChange={() => !isWarming && toggleInbox(inbox.id)} className="accent-orange-500 disabled:opacity-40" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium">{inbox.label}</div>
                      <div className="text-white/35 text-xs">{inbox.email_address} · {inbox.daily_send_limit}/day</div>
                      {isWarming && <div className="text-amber-400/70 text-xs mt-0.5">Warming up — available in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</div>}
                    </div>
                  </label>
                );
              })}
              {!inboxes.length && <p className="text-white/30 text-sm">No active inboxes. <a href="/inboxes/new" className="text-orange-400">Add one first.</a></p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send Window Start</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send Window End</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send Days</label>
            <div className="flex gap-2">
              {DAYS.map((d) => (
                <button key={d} onClick={() => toggleDay(d)} className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-all ${sendDays.includes(d) ? "bg-orange-500/20 border-orange-500/40 text-orange-300" : "bg-white/4 border-white/8 text-white/30"}`}>{d.slice(0,1).toUpperCase() + d.slice(1,2)}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Daily Send Cap</label>
            <input type="number" value={dailyCap} onChange={(e) => setDailyCap(parseInt(e.target.value))} min={1} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50" />
          </div>

          {/* Throttle */}
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Send Throttle (human-like delays)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-1">Min Delay (seconds)</label>
                <input type="number" value={minDelay} onChange={(e) => setMinDelay(parseInt(e.target.value) || 30)} min={5} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Max Delay (seconds)</label>
                <input type="number" value={maxDelay} onChange={(e) => setMaxDelay(parseInt(e.target.value) || 120)} min={5} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40" />
              </div>
            </div>
            <p className="text-white/25 text-xs">A random delay between {minDelay}–{maxDelay}s is applied between each email send.</p>
          </div>

          {/* Campaign behavior toggles */}
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Campaign Behavior</p>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white/80 text-sm font-medium">Stop on Reply</p>
                <p className="text-white/35 text-xs">Halt sequence when a lead replies</p>
              </div>
              <div
                onClick={() => setStopOnReply(!stopOnReply)}
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 ${stopOnReply ? "bg-green-500" : "bg-white/15"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${stopOnReply ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white/80 text-sm font-medium">Pause After Open</p>
                <p className="text-white/35 text-xs">Pause sequence when a lead opens an email (wait for manual review)</p>
              </div>
              <div
                onClick={() => setPauseAfterOpen(!pauseAfterOpen)}
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 ${pauseAfterOpen ? "bg-amber-500" : "bg-white/15"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${pauseAfterOpen ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Step 1: Lead lists */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-white/60 text-sm">Select which lead lists to include in this campaign</p>
          {lists.map((list) => (
            <label key={list.id} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedLists.includes(list.id) ? "border-orange-500/40 bg-orange-500/10" : "border-white/8 bg-white/3 hover:bg-white/5"}`}>
              <input type="checkbox" checked={selectedLists.includes(list.id)} onChange={() => toggleList(list.id)} className="accent-orange-500" />
              <div>
                <div className="text-white text-sm font-medium">{list.name}</div>
                <div className="text-white/35 text-xs">{(list.lead_count ?? 0).toLocaleString()} leads</div>
              </div>
            </label>
          ))}
          {!lists.length && <p className="text-white/30 text-sm">No lead lists. <a href="/leads" className="text-orange-400">Create one first.</a></p>}
        </div>
      )}

      {/* Step 2: Sequence */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-white/60 text-sm">Use {`{{first_name}}, {{last_name}}, {{company}}, {{title}}`} as variables.</p>
            <button
              onClick={() => { setShowAiGen(true); setAiError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Generate
            </button>
          </div>

          {seqSteps.map((s, i) => (
            <div key={i} className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Step {i + 1} · {s.type === "wait" ? `Wait ${s.wait_days} day${s.wait_days !== 1 ? "s" : ""}` : "Email"}</span>
                <button onClick={() => removeStep(i)} className="text-red-400/60 hover:text-red-400 text-xs">Remove</button>
              </div>
              {s.type === "wait" ? (
                <div className="flex items-center gap-3">
                  <span className="text-white/40 text-sm">Wait</span>
                  <input type="number" value={s.wait_days} onChange={(e) => updateStep(i, "wait_days", parseInt(e.target.value))} min={1} className="w-20 bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none" />
                  <span className="text-white/40 text-sm">days before next step</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    {/* Load template button */}
                    {templates.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setLoadingTemplate(loadingTemplate === i ? null : i)}
                          className="text-orange-400 hover:text-orange-300 text-xs transition-colors"
                        >
                          Load Template ▾
                        </button>
                        {loadingTemplate === i && (
                          <div className="absolute left-0 top-6 z-20 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl py-1 min-w-56 max-h-48 overflow-y-auto">
                            {templates.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => loadTemplate(i, t)}
                                className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors"
                              >
                                <div className="font-medium text-white/90">{t.name}</div>
                                <div className="text-white/35 text-xs truncate">{t.subject}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Test send button */}
                    <button
                      onClick={() => { setTestStepIdx(i); setTestResult(null); setTestSampleIdx(-1); setTestToEmail(""); setTestInboxId(selectedInboxes[0] ?? ""); }}
                      className="text-amber-400/80 hover:text-amber-300 text-xs transition-colors ml-auto"
                    >
                      Send Test ↗
                    </button>
                  </div>

                  {/* Subject A */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Subject {s.subject_template_b ? "(Variant A)" : ""}</label>
                    <input value={s.subject_template} onChange={(e) => updateStep(i, "subject_template", e.target.value)} placeholder="Email subject" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/40" />
                  </div>

                  {/* Subject B (A/B testing) */}
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Subject B <span className="text-white/20">(optional — 50% of sends use this)</span></label>
                    <input value={s.subject_template_b} onChange={(e) => updateStep(i, "subject_template_b", e.target.value)} placeholder="Alternate subject for A/B test" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/40" />
                  </div>

                  <textarea value={s.body_template} onChange={(e) => updateStep(i, "body_template", e.target.value)} rows={5} placeholder="Email body (supports {{first_name}} etc)" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 resize-none" />
                </>
              )}
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => addStep("email")} className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">+ Add Email</button>
            <button onClick={() => addStep("wait")}  className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/70 text-sm rounded-xl border border-white/10 transition-colors">+ Add Wait Step</button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-white/40">Campaign name</span><span className="text-white font-medium">{name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Inboxes</span><span className="text-white">{selectedInboxes.length} selected</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Lead lists</span><span className="text-white">{lists.filter((l) => selectedLists.includes(l.id)).map((l) => l.name).join(", ")}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Total leads</span><span className="text-white">{lists.filter((l) => selectedLists.includes(l.id)).reduce((s, l) => s + (l.lead_count ?? 0), 0).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Sequence steps</span><span className="text-white">{seqSteps.length} ({seqSteps.filter((s) => s.type === "email").length} emails)</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">A/B tests</span><span className="text-white">{seqSteps.filter((s) => s.type === "email" && s.subject_template_b).length} step{seqSteps.filter((s) => s.type === "email" && s.subject_template_b).length !== 1 ? "s" : ""}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Send window</span><span className="text-white">{startTime}–{endTime} · {sendDays.join(", ")}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Daily cap</span><span className="text-white">{dailyCap} emails</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Throttle</span><span className="text-white">{minDelay}–{maxDelay}s between sends</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Stop on reply</span><span className={stopOnReply ? "text-green-400" : "text-white/40"}>{stopOnReply ? "Yes" : "No"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-white/40">Pause after open</span><span className={pauseAfterOpen ? "text-amber-400" : "text-white/40"}>{pauseAfterOpen ? "Yes" : "No"}</span></div>
          </div>
          <p className="text-white/30 text-xs">Leads will be enrolled and the campaign will start sending during the next scheduled window.</p>
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex justify-between mt-8">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="px-5 py-2.5 bg-white/6 hover:bg-white/10 disabled:opacity-30 text-white/70 text-sm rounded-xl transition-colors">Back</button>
        {step < 3 ? (
          <button onClick={() => { setError(null); setStep((s) => s + 1); }} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">Continue</button>
        ) : (
          <button onClick={handleFinish} disabled={saving} className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? "Creating & Enrolling…" : "Launch Campaign"}
          </button>
        )}
      </div>

      {/* AI Sequence Generator modal */}
      {showAiGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <h2 className="text-white font-semibold text-sm">AI Sequence Generator</h2>
              </div>
              <button onClick={() => setShowAiGen(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {aiError && <div className="px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs">{aiError}</div>}
              <div>
                <label className="block text-xs text-white/40 mb-1">Product / Service</label>
                <input value={aiProduct} onChange={(e) => setAiProduct(e.target.value)} placeholder="Acme Corp — B2B sales automation software" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/40" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Target Audience</label>
                <input value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} placeholder="Real estate project managers at mid-size firms" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/40" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Value Proposition</label>
                <input value={aiValueProp} onChange={(e) => setAiValueProp(e.target.value)} placeholder="Cuts project planning time by 60% using AI" className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/40" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1">Tone</label>
                  <select value={aiTone} onChange={(e) => setAiTone(e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40">
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="direct">Direct</option>
                    <option value="casual">Casual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Emails</label>
                  <input type="number" value={aiNumEmails} onChange={(e) => setAiNumEmails(parseInt(e.target.value) || 3)} min={1} max={7} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Wait Days</label>
                  <input type="number" value={aiWaitDays} onChange={(e) => setAiWaitDays(parseInt(e.target.value) || 3)} min={1} max={14} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/40" />
                </div>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={aiGenerating}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {aiGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Generating sequence…
                  </>
                ) : "Generate Sequence"}
              </button>
              <p className="text-white/25 text-xs text-center">The AI will replace your current sequence steps.</p>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Email modal */}
      {testStepIdx !== null && (() => {
        const step = seqSteps[testStepIdx];
        const sampleLead = testSampleIdx >= 0 ? testSampleLeads[testSampleIdx]?.lead ?? null : null;
        const renderedSubject = renderTemplate(step?.subject_template ?? "", sampleLead);
        const renderedBody    = renderTemplate(step?.body_template    ?? "", sampleLead);
        const selectedInbox   = inboxes.find(i => i.id === testInboxId);
        const isHtml          = /<[a-z][\s\S]*>/i.test(renderedBody);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setTestInboxOpen(false)}>
            <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-white font-semibold text-sm">Send Test Email</h2>
                  <div className="flex items-center gap-1">
                    {seqSteps.filter(s => s.type === "email").map((_, i) => {
                      const emailSteps = seqSteps.map((s, idx) => ({ s, idx })).filter(({ s }) => s.type === "email");
                      const actualIdx = emailSteps[i]?.idx ?? -1;
                      return (
                        <button key={i} onClick={() => { setTestStepIdx(actualIdx); setTestResult(null); setTestDns(null); }}
                          className={`w-6 h-6 rounded-full text-[11px] font-semibold transition-colors ${actualIdx === testStepIdx ? "bg-orange-500 text-white" : "bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70"}`}>
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-white/20 text-xs">Step {testStepIdx + 1}</span>
                </div>
                <button onClick={() => { setTestStepIdx(null); setTestResult(null); setTestDns(null); setTestInboxOpen(false); }} className="text-white/40 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: Config ── */}
                <div className="w-72 flex-shrink-0 border-r border-white/8 flex flex-col overflow-y-auto">
                  <div className="p-5 space-y-4 flex-1">

                    {/* Send From */}
                    <div>
                      <label className="block text-xs text-white/40 mb-2 font-medium">Send From</label>
                      <div className="relative">
                        <button type="button" onClick={e => { e.stopPropagation(); setTestInboxOpen(v => !v); }}
                          className="w-full flex items-center gap-2.5 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 hover:bg-white/8 transition-colors text-left">
                          {selectedInbox ? (
                            <>
                              <div className="w-7 h-7 bg-orange-500/20 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-orange-300">
                                {selectedInbox.email_address[0].toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-white text-xs font-medium truncate">{selectedInbox.email_address}</p>
                                {selectedInbox.label && <p className="text-white/35 text-[10px] truncate">{selectedInbox.label}</p>}
                              </div>
                            </>
                          ) : (
                            <span className="text-white/30 text-sm flex-1">Select inbox…</span>
                          )}
                          <svg className={`w-4 h-4 text-white/25 flex-shrink-0 transition-transform ${testInboxOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {testInboxOpen && (
                          <div className="absolute top-full mt-1 left-0 right-0 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-20 max-h-52 overflow-y-auto">
                            {inboxes.map(inbox => (
                              <button key={inbox.id} type="button"
                                onClick={() => { setTestInboxId(inbox.id); setTestInboxOpen(false); setTestDns(null); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/6 transition-colors text-left ${testInboxId === inbox.id ? "bg-white/8" : ""}`}>
                                <div className="w-7 h-7 bg-orange-500/15 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-orange-300/70">
                                  {inbox.email_address[0].toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-xs font-medium truncate">{inbox.email_address}</p>
                                  {inbox.label && <p className="text-white/30 text-[10px] truncate">{inbox.label}</p>}
                                </div>
                                {testInboxId === inbox.id && <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Send To */}
                    <div>
                      <label className="block text-xs text-white/40 mb-2 font-medium">Send To</label>
                      <input type="email" value={testToEmail} onChange={e => setTestToEmail(e.target.value)}
                        placeholder="you@domain.com"
                        className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors" />
                    </div>

                    {/* Lead Sample */}
                    <div>
                      <label className="block text-xs text-white/40 mb-2 font-medium">
                        Lead Sample <span className="text-white/20 font-normal">(for variable preview)</span>
                      </label>
                      <select value={testSampleIdx} onChange={e => setTestSampleIdx(Number(e.target.value))}
                        className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-white/25 transition-colors appearance-none">
                        <option value={-1}>Sample data (Jane Smith, Acme Corp)</option>
                        {testSampleLeads.map((e, i) => e.lead && (
                          <option key={e.id} value={i}>
                            {[e.lead.first_name, e.lead.last_name].filter(Boolean).join(" ") || e.lead.email}
                            {e.lead.company ? ` · ${e.lead.company}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Deliverability Check */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-white/40 font-medium">Deliverability</label>
                        {testDns?.score !== undefined && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${testDns.score === 4 ? "bg-emerald-500/15 text-emerald-400" : testDns.score >= 2 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                            {testDns.score}/{testDns.max_score} checks passed
                          </span>
                        )}
                      </div>
                      <button onClick={handleCheckDns} disabled={!testInboxId || testDnsLoading}
                        className="w-full py-2 bg-white/6 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white/70 text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
                        {testDnsLoading ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Checking DNS…</> : "Check SPF / DKIM / DMARC"}
                      </button>
                      {testDns && !("error" in testDns && testDns.error) && testDns.checks && (
                        <div className="mt-3 space-y-2">
                          <p className="text-[10px] text-white/25 font-medium uppercase tracking-wide">{testDns.domain}</p>
                          {(Object.entries(testDns.checks) as [string, { pass: boolean; detail: string }][]).map(([key, check]) => (
                            <div key={key} className="flex items-start gap-2">
                              <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${check.pass ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                {check.pass ? "✓" : "✗"}
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">{key} </span>
                                <span className="text-[10px] text-white/30">{check.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {testDns && "error" in testDns && testDns.error && (
                        <p className="mt-2 text-[10px] text-red-400/70">{String(testDns.error)}</p>
                      )}
                    </div>
                  </div>

                  {/* Send button pinned to bottom */}
                  <div className="p-5 border-t border-white/8 space-y-2 flex-shrink-0">
                    {testResult && (
                      <div className={`px-3 py-2 rounded-lg text-xs ${testResult.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {testResult}
                      </div>
                    )}
                    <button onClick={handleTestSend} disabled={testSending || !testInboxId || !testToEmail}
                      className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors">
                      {testSending ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Test Email</>}
                    </button>
                  </div>
                </div>

                {/* ── RIGHT: Preview ── */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                  {/* Subject bar */}
                  <div className="px-6 py-3 border-b border-white/8 flex-shrink-0">
                    <p className="text-[10px] text-white/30 font-medium uppercase tracking-wide mb-1">Subject</p>
                    <p className="text-white/80 text-sm font-medium truncate">{renderedSubject || <span className="text-white/20 italic">No subject</span>}</p>
                  </div>

                  {/* Preview tabs */}
                  <div className="flex items-center gap-1 px-6 py-2.5 border-b border-white/8 flex-shrink-0">
                    <button onClick={() => setTestPreviewTab("preview")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${testPreviewTab === "preview" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
                      Preview
                    </button>
                    <button onClick={() => setTestPreviewTab("plain")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${testPreviewTab === "plain" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
                      Plain Text
                    </button>
                    <div className="flex-1" />
                    {sampleLead && (
                      <span className="text-[10px] text-white/25">Previewing as {sampleLead.first_name ?? sampleLead.email}</span>
                    )}
                  </div>

                  {/* Email body */}
                  <div className="flex-1 overflow-auto bg-white/2">
                    {testPreviewTab === "preview" ? (
                      isHtml ? (
                        <iframe
                          key={renderedBody}
                          srcDoc={`<!DOCTYPE html><html><head><style>body{margin:0;padding:24px;font-family:sans-serif;font-size:14px;color:#333;line-height:1.6;background:#fff}a{color:#1a73e8}*{max-width:100%;box-sizing:border-box}</style></head><body>${renderedBody}</body></html>`}
                          sandbox="allow-same-origin"
                          className="w-full border-0 bg-white"
                          style={{ minHeight: "400px" }}
                          onLoad={e => { const f = e.currentTarget; if (f.contentDocument?.body) f.style.height = f.contentDocument.body.scrollHeight + 48 + "px"; }}
                        />
                      ) : (
                        <div className="p-6">
                          <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans leading-relaxed">{renderedBody || <span className="text-white/20 italic">No body content</span>}</pre>
                        </div>
                      )
                    ) : (
                      <div className="p-6">
                        <pre className="text-white/50 text-xs whitespace-pre-wrap font-mono leading-relaxed break-all">{step?.body_template || "(empty)"}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
