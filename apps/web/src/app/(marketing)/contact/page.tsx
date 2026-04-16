import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";

async function getContactEmail(): Promise<string> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("admin_settings")
      .select("value")
      .eq("key", "support_email")
      .single();
    if (data?.value) return JSON.parse(data.value) as string;
  } catch { /* fall through */ }
  return "support@leadash.com";
}

export default async function ContactPage() {
  const contactEmail = await getContactEmail();

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      {/* Header */}
      <div className="mb-16">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-orange-400 border mb-6"
          style={{ borderColor: "rgba(249,115,22,0.25)", background: "rgba(249,115,22,0.08)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          We&rsquo;re here
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-5" style={{ letterSpacing: "-0.03em" }}>
          Get in{" "}
          <span style={{ background: "linear-gradient(135deg, #fdba74 0%, #f97316 50%, #fb923c 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            touch
          </span>
        </h1>
        <p className="text-white/45 text-lg leading-relaxed max-w-lg mx-auto">
          Have a question about the platform, pricing, or your account? We read every message and reply within one business day.
        </p>
      </div>

      {/* Contact card */}
      <a
        href={`mailto:${contactEmail}`}
        className="flex items-center gap-5 rounded-2xl p-6 text-left group transition-all hover:scale-[1.01] mb-4"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}
        >
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-0.5">Email us</p>
          <p className="text-white font-semibold text-base">{contactEmail}</p>
          <p className="text-white/35 text-sm mt-0.5">General enquiries, support, and partnerships</p>
        </div>
        <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </a>

      {/* Live chat card */}
      <Link
        href="/login"
        className="flex items-center gap-5 rounded-2xl p-6 text-left group transition-all hover:scale-[1.01] mb-10"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-0.5">Live chat</p>
          <p className="text-white font-semibold text-base">Available inside the app</p>
          <p className="text-white/35 text-sm mt-0.5">Fastest response — typically under 2 hours</p>
        </div>
        <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>

      {/* Response note */}
      <div
        className="rounded-2xl px-6 py-4 flex items-center gap-3"
        style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}
      >
        <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
        <p className="text-orange-300/70 text-sm text-left">
          Our team operates across multiple time zones — most replies arrive within a few hours.
        </p>
      </div>
    </div>
  );
}
