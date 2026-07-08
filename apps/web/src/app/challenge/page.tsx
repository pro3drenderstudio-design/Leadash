"use client";
import { useState, useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string; email: string; amount: number; currency: string;
        metadata?: Record<string, string>;
        callback: (resp: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
    fbq?: (...args: unknown[]) => void;
  }
}

const OPAY_ACCOUNT   = "9021060638";
const OPAY_NAME      = "Vescrow Solutions";
const AMOUNT_NGN     = 10_000;
const WA_MANAGER     = "2349110260332";

const DAYS = [
  { day: 1, title: "Your Money-Making Skill Stack", desc: "Identify the exact skill combination that clients pay for. Most people already have it — they just haven't packaged it right." },
  { day: 2, title: "Build Your Proof Arsenal", desc: "Create a portfolio of results even if you've never worked with a client. The frameworks that get you hired before you're 'experienced'." },
  { day: 3, title: "Find 50 Ready-to-Buy Leads Today", desc: "The exact platforms, search strings, and filter combinations that surface decision-makers with active budgets right now." },
  { day: 4, title: "Craft the Message They Can't Ignore", desc: "A 3-sentence cold outreach template with a 40%+ reply rate. Personalisation formula that takes under 3 minutes per prospect." },
  { day: 5, title: "The Follow-Up System That Closes Deals", desc: "80% of clients say yes after follow-up. The precise sequence and timing that keeps you top-of-mind without being annoying." },
  { day: 6, title: "Price It, Pitch It, Close It", desc: "How to price your offer for Nigerian and international clients. The 4-minute discovery call structure that leads directly to 'how do we start?'" },
  { day: 7, title: "Land Your First Client Live", desc: "Send your outreach, review together, get live feedback. Leave with your first reply or first booking — on day 7." },
];

const TESTIMONIALS = [
  { initials: "AO", name: "Adaora Okonkwo", result: "₦580k in first week", quote: "Day 3's lead-finding technique alone was worth 10× the price. I found 60 warm prospects in 2 hours." },
  { initials: "JB", name: "Joshua Bankole",  result: "3 clients in 7 days",  quote: "I'd been freelancing for 2 years with no system. This gave me a repeatable machine. My income doubled in a month." },
  { initials: "FO", name: "Fatima Osei",     result: "Landed UK client",     quote: "The pricing module changed my mindset completely. I'd been charging ₦50k for work worth ₦500k internationally." },
  { initials: "TN", name: "Taiwo Nwosu",     result: "Remote salary offer",  quote: "Used the outreach template on LinkedIn and got a DM from a Lagos startup offering a full-time remote role in 4 days." },
];

const FAQS = [
  { q: "Who exactly is this challenge for?", a: "Anyone who wants to get paid for a skill — freelancers, agency owners, consultants, job seekers targeting remote roles, or employed professionals building a side income. If you have a marketable skill and want clients or a job within 7 days, this is for you." },
  { q: "What if I don't have a skill yet?", a: "Day 1 covers this exactly. Most people already have monetisable skills and don't know it. If you genuinely need to learn one first, we'll point you to the fastest path — but most participants are surprised to discover they already have what it takes." },
  { q: "Is ₦10,000 the full price? Any hidden charges?", a: "₦10,000 is everything. No monthly fee, no upsell you need to buy to participate. There is an optional annual bundle offered at the end — completely optional, never required." },
  { q: "How do I pay if I don't have a card?", a: "Transfer ₦10,000 to Opay account 9021060638 (Vescrow Solutions). After transfer, fill the form below with the name you used for the transfer. Our team confirms within 2 hours during business hours." },
  { q: "What happens after I register?", a: "You'll be added to a private WhatsApp community. Each morning at 8am you get the day's lesson link. Our community manager confirms your payment within 2 hours and grants you access." },
  { q: "Is there a guarantee?", a: "Complete all 7 days, show us you did the work, and if you haven't made progress toward a client or job opportunity, we'll refund you. We've never had to." },
];

type PaymentMethod = "bank" | "paystack";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  bankName: string;  // name used in bank transfer
  password: string;
  paymentMethod: PaymentMethod;
}

function ChallengeForm() {
  const [form, setForm]     = useState<FormState>({ fullName: "", email: "", phone: "", bankName: "", password: "", paymentMethod: "bank" });
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState<{ wa_url: string } | null>(null);
  const [copied, setCopied]   = useState(false);
  const [psReady, setPsReady] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const pk = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "" : "";

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  function copyAccount() {
    navigator.clipboard.writeText(OPAY_ACCOUNT).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitSignup(paymentMethod: PaymentMethod, paystackRef?: string) {
    setLoad(true);
    setError("");
    try {
      const res = await fetch("/api/challenge/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name:         form.fullName,
          email:             form.email,
          phone:             form.phone,
          bank_account_name: paymentMethod === "bank" ? form.bankName : form.fullName,
          password:          form.password,
          payment_method:    paymentMethod,
          paystack_reference: paystackRef ?? null,
        }),
      });
      const data = await res.json() as { ok?: boolean; wa_url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess({ wa_url: data.wa_url! });
      // Fire lead event
      if (typeof window.fbq === "function") {
        window.fbq("track", "Lead", { value: AMOUNT_NGN, currency: "NGN", content_name: "7day-challenge" });
      }
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoad(false);
    }
  }

  function handleBankSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bankName.trim()) { setError("Please enter the exact name you used for the bank transfer."); return; }
    void submitSignup("bank");
  }

  function handlePaystack() {
    if (!psReady || !window.PaystackPop) { setError("Paystack is loading, please wait a moment."); return; }
    if (!form.email || !form.fullName || !form.phone || !form.password) {
      setError("Please fill in all fields above before paying with Paystack."); return;
    }
    const handler = window.PaystackPop.setup({
      key:      pk,
      email:    form.email,
      amount:   AMOUNT_NGN * 100,
      currency: "NGN",
      metadata: { full_name: form.fullName, phone: form.phone, challenge: "7day" },
      callback: (resp) => { void submitSignup("paystack", resp.reference); },
      onClose:  () => { setError("Payment window closed. Try again when ready."); },
    });
    handler.openIframe();
  }

  if (success) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 440, margin: "0 auto", border: "1px solid #e5e7eb" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>You&apos;re registered!</h3>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Now message our community manager on WhatsApp to confirm your payment and get access.
          Check your email — we also sent your login details.
        </p>
        <a
          href={success.wa_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}
        >
          💬 Message Us on WhatsApp
        </a>
        <p style={{ color: "#9ca3af", fontSize: 11 }}>
          We confirm payment and grant access within 2 hours during business hours.
        </p>
      </div>
    );
  }

  return (
    <div ref={formRef} style={{ background: "#fff", borderRadius: 16, padding: "36px 32px", maxWidth: 480, margin: "0 auto", border: "1px solid #e5e7eb", boxShadow: "0 20px 60px -20px rgba(0,0,0,0.12)" }}>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: "#111827", textAlign: "center", marginBottom: 4 }}>Join the 7-Day Challenge</h3>
      <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", marginBottom: 24 }}>₦10,000 one-time · Lifetime access to community</p>

      {/* Common fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {[
          { key: "fullName" as const, label: "Full Name", type: "text", placeholder: "e.g. Adaora Okonkwo" },
          { key: "email"    as const, label: "Email Address", type: "email", placeholder: "you@gmail.com" },
          { key: "phone"    as const, label: "WhatsApp Number", type: "tel", placeholder: "+234 801 234 5678" },
          { key: "password" as const, label: "Password for your Leadash account", type: "password", placeholder: "Min. 8 characters" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              required
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "11px 13px", fontSize: 14, color: "#111827", background: "#f9fafb", fontFamily: "inherit", outline: "none" }}
            />
          </div>
        ))}
      </div>

      {/* Payment method toggle */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 8 }}>Payment Method</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["bank", "paystack"] as PaymentMethod[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, paymentMethod: m }))}
              style={{
                padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .15s",
                border: form.paymentMethod === m ? "2px solid #f97316" : "1px solid #d1d5db",
                background: form.paymentMethod === m ? "#fff7ed" : "#f9fafb",
                color: form.paymentMethod === m ? "#c2410c" : "#6b7280",
              }}
            >
              {m === "bank" ? "🏦 Bank Transfer" : "💳 Pay Online"}
            </button>
          ))}
        </div>
      </div>

      {/* Bank transfer instructions */}
      {form.paymentMethod === "bank" && (
        <form onSubmit={handleBankSubmit}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "16px", marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 10 }}>Transfer ₦10,000 to:</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 7, padding: "10px 13px", border: "1px solid #fcd34d" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: ".02em" }}>{OPAY_ACCOUNT}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>OPay · {OPAY_NAME}</div>
              </div>
              <button
                type="button"
                onClick={copyAccount}
                style={{ background: copied ? "#dcfce7" : "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: copied ? "#16a34a" : "#374151", fontWeight: 500 }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#78350f", marginTop: 8 }}>
              After transferring, enter the <strong>account name you used</strong> below and submit.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>Your Transfer Account Name</label>
            <input
              type="text"
              value={form.bankName}
              onChange={set("bankName")}
              placeholder="Exact name on your bank account"
              required
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "11px 13px", fontSize: 14, color: "#111827", background: "#f9fafb", fontFamily: "inherit" }}
            />
          </div>

          {error && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", background: loading ? "#9ca3af" : "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 10, border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 8px 20px -8px rgba(249,115,22,.5)" }}
          >
            {loading ? "Registering..." : "I've Paid — Register Me →"}
          </button>
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 10 }}>
            Our community manager confirms within 2 hours and adds you to the WhatsApp group.
          </p>
        </form>
      )}

      {/* Paystack */}
      {form.paymentMethod === "paystack" && (
        <div>
          {error && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</p>}
          <button
            type="button"
            onClick={handlePaystack}
            disabled={loading || !psReady}
            style={{ width: "100%", background: loading ? "#9ca3af" : "#0ba4db", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 10, border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 8px 20px -8px rgba(11,164,219,.5)" }}
          >
            {loading ? "Processing..." : !psReady ? "Loading payment..." : "Pay ₦10,000 Online →"}
          </button>
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 10 }}>
            Card, bank transfer, USSD, mobile money — all accepted. Instant confirmation.
          </p>
          <Script src="https://js.paystack.co/v1/inline.js" onReady={() => setPsReady(true)} />
        </div>
      )}
    </div>
  );
}

export default function ChallengePage() {
  const [openDay, setOpenDay]   = useState<number | null>(null);
  const [openFaq, setOpenFaq]   = useState<number | null>(null);
  const [countdown, setCountdown] = useState({ h: 47, m: 59, s: 59 });

  // Countdown — 48h window
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        let { h, m, s } = prev;
        if (s > 0) return { h, m, s: s - 1 };
        if (m > 0) return { h, m: m - 1, s: 59 };
        if (h > 0) return { h: h - 1, m: 59, s: 59 };
        return { h: 0, m: 0, s: 0 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function pad(n: number) { return String(n).padStart(2, "0"); }

  const scrollToForm = () => {
    document.getElementById("join-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#111827", background: "#fff" }}>

      {/* Countdown strip */}
      <div style={{ background: "#111827", color: "#fff", padding: "10px 16px", textAlign: "center", fontSize: 13 }}>
        <span style={{ color: "#9ca3af" }}>Enrollment closes in: </span>
        <strong style={{ color: "#f97316", fontVariantNumeric: "tabular-nums" }}>
          {pad(countdown.h)}h {pad(countdown.m)}m {pad(countdown.s)}s
        </strong>
        <span style={{ color: "#6b7280", marginLeft: 12 }}>· Only 50 spots per cohort</span>
      </div>

      {/* Hero */}
      <section style={{ background: "#fff", padding: "72px 24px 56px", textAlign: "center", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 24 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f97316", display: "inline-block", animation: "pulse 2s infinite" }} />
          7-Day Job &amp; Client Acquisition Challenge
        </div>
        <h1 style={{ fontSize: "clamp(32px,6vw,58px)", fontWeight: 800, lineHeight: 1.1, color: "#111827", marginBottom: 20, letterSpacing: "-0.02em" }}>
          Land a Job or High-Paying<br />
          <span style={{ color: "#f97316" }}>Client in 7 Days</span>
        </h1>
        <p style={{ fontSize: "clamp(16px,2.5vw,20px)", color: "#4b5563", maxWidth: 580, margin: "0 auto 32px", lineHeight: 1.6 }}>
          A structured, hands-on challenge that takes you from zero to your first client or job offer — in just one week. Live community. Daily lessons. Real results.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
          <button onClick={scrollToForm} style={{ background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px 36px", borderRadius: 11, border: "none", cursor: "pointer", boxShadow: "0 14px 30px -10px rgba(249,115,22,.5)" }}>
            Join the Challenge — ₦10,000 →
          </button>
          <a href="#curriculum" style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: 16, padding: "15px 36px", borderRadius: 11, textDecoration: "none" }}>
            See What You&apos;ll Learn
          </a>
        </div>

        {/* Social proof row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: -8 }}>
            {TESTIMONIALS.map(t => (
              <div key={t.initials} style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#f97316,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, border: "2px solid #fff", marginLeft: -8 }}>
                {t.initials}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            <strong style={{ color: "#111827" }}>500+ students</strong> from Nigeria, Ghana, Kenya &amp; UK
          </p>
        </div>
      </section>

      {/* VSL */}
      <section style={{ background: "#f9fafb", padding: "56px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 14, color: "#6b7280", fontWeight: 500, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Watch Before You Scroll Past</p>
          <div style={{ aspectRatio: "16/9", borderRadius: 16, overflow: "hidden", background: "#111827", position: "relative", boxShadow: "0 30px 80px -24px rgba(0,0,0,.25)" }}>
            <video
              id="vsl-video"
              controls
              playsInline
              style={{ width: "100%", height: "100%", display: "block" }}
              poster=""
            >
              <source src="https://bpftbaoziloqxdsyhcyt.supabase.co/storage/v1/object/public/funnel-media/Leadash%20Training%20VSL.mp4" type="video/mp4" />
              Your browser does not support video.
            </video>
            {/* Placeholder play button shown when src is empty */}
            <div id="vsl-placeholder" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0f172a,#1e293b)", cursor: "pointer" }}
              onClick={() => { const v = document.getElementById("vsl-video") as HTMLVideoElement | null; if (v) v.play().catch(() => {}); }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 0 40px rgba(249,115,22,.5)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <p style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, margin: 0 }}>Watch the challenge overview</p>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0 0" }}>~8 minutes · No sound needed first 30 sec</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ background: "#111827", padding: "40px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "center", gap: "clamp(24px,6vw,80px)", flexWrap: "wrap" }}>
          {[
            { value: "500+",   label: "Students Enrolled" },
            { value: "₦2M+",  label: "Earned by Alumni" },
            { value: "7",      label: "Days to Results" },
            { value: "93%",    label: "Completion Rate" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, color: "#fff" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Curriculum */}
      <section id="curriculum" style={{ background: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 13, color: "#f97316", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your 7-Day Roadmap</p>
          <h2 style={{ textAlign: "center", fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, color: "#111827", marginBottom: 8 }}>What You&apos;ll Learn Each Day</h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 15, marginBottom: 40 }}>Structured daily lessons + live community accountability</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DAYS.map(d => (
              <div key={d.day} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setOpenDay(openDay === d.day ? null : d.day)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: openDay === d.day ? "#fff7ed" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: "#f97316", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                    {d.day}
                  </span>
                  <span style={{ fontWeight: 600, color: "#111827", fontSize: 15, flex: 1 }}>{d.title}</span>
                  <span style={{ color: "#9ca3af", fontSize: 18 }}>{openDay === d.day ? "−" : "+"}</span>
                </button>
                {openDay === d.day && (
                  <div style={{ padding: "0 20px 16px 72px", color: "#4b5563", fontSize: 14, lineHeight: 1.65 }}>
                    {d.desc}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who this is for */}
      <section style={{ background: "#f9fafb", padding: "64px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 20 }}>✅ This is for you if...</h3>
              {[
                "You want to get paid for a skill in 7 days or less",
                "You're a freelancer, consultant, or job seeker",
                "You want remote clients in Nigeria, UK, US, or Canada",
                "You've tried to get clients before but can't get replies",
                "You want a step-by-step system, not theory",
              ].map(t => (
                <div key={t} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#16a34a", fontSize: 15, marginTop: 1 }}>✓</span>
                  <span style={{ color: "#374151", fontSize: 14, lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 20 }}>❌ This is NOT for you if...</h3>
              {[
                "You want to 'learn' but not do the work",
                "You're not willing to send 50 cold messages in week 1",
                "You expect a magic trick, not a skill",
                "You already have a client system that works",
              ].map(t => (
                <div key={t} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#dc2626", fontSize: 15, marginTop: 1 }}>✗</span>
                  <span style={{ color: "#374151", fontSize: 14, lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 13, color: "#f97316", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Social Proof</p>
          <h2 style={{ textAlign: "center", fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: "#111827", marginBottom: 40 }}>Real Results From Past Students</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 20 }}>
            {TESTIMONIALS.map(t => (
              <div key={t.initials} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 14, padding: "22px 20px" }}>
                <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, fontStyle: "italic", marginBottom: 16 }}>&ldquo;{t.quote}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#f97316,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#f97316" }}>{t.result}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to join */}
      <section style={{ background: "#111827", padding: "64px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: "#fff", marginBottom: 8 }}>How to Join</h2>
          <p style={{ color: "#9ca3af", fontSize: 15, marginBottom: 40 }}>3 steps and you&apos;re in the challenge</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 20, textAlign: "left" }}>
            {[
              { n: 1, title: "Transfer ₦10,000", desc: `Send to OPay ${OPAY_ACCOUNT} (${OPAY_NAME})` },
              { n: 2, title: "Fill the Form Below", desc: "Enter the name you used for the transfer + your account details" },
              { n: 3, title: "Message Us on WhatsApp", desc: "Our community manager confirms and adds you to the private group" },
            ].map(s => (
              <div key={s.n} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "22px 18px" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f97316", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>{s.n}</div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 15, marginBottom: 6 }}>{s.title}</div>
                <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signup form */}
      <section id="join-form" style={{ background: "#f9fafb", padding: "72px 24px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 13, color: "#f97316", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Secure Your Spot</p>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px,4vw,32px)", fontWeight: 800, color: "#111827", marginBottom: 6 }}>Join the 7-Day Challenge</h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, marginBottom: 28 }}>₦10,000 · Spots limited to 50 per cohort</p>
          <ChallengeForm />
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px,4vw,34px)", fontWeight: 800, color: "#111827", marginBottom: 40 }}>Frequently Asked Questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQS.map((f, i) => (
              <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", background: openFaq === i ? "#fff7ed" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>{f.q}</span>
                  <span style={{ color: "#9ca3af", fontSize: 18, flexShrink: 0 }}>{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 20px 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.65 }}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ background: "#f97316", padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(24px,4vw,38px)", fontWeight: 800, color: "#fff", marginBottom: 12 }}>Ready to Land Your First Client?</h2>
        <p style={{ color: "#fed7aa", fontSize: 16, marginBottom: 28 }}>Join 500+ students. 7 days. Real results.</p>
        <button onClick={scrollToForm} style={{ background: "#fff", color: "#c2410c", fontWeight: 700, fontSize: 16, padding: "14px 36px", borderRadius: 11, border: "none", cursor: "pointer" }}>
          Join the Challenge — ₦10,000
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: "#111827", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ color: "#6b7280", fontSize: 12 }}>
          © 2025 Leadash · Questions? WhatsApp{" "}
          <a href={`https://wa.me/${WA_MANAGER}`} style={{ color: "#9ca3af" }}>+{WA_MANAGER}</a>
          {" · "}
          <a href="/terms" style={{ color: "#9ca3af" }}>Terms</a>
          {" · "}
          <a href="/privacy" style={{ color: "#9ca3af" }}>Privacy</a>
        </p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        * { box-sizing: border-box; }
        button, input, textarea, select { font-family: inherit; }
        body { margin: 0; }
      `}</style>
    </div>
  );
}
