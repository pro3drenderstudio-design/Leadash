"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const SOCIAL_PROOF = [
  { initials: "AO", name: "Adaora O.",  role: "₦2.1M closed in 30 days" },
  { initials: "KB", name: "Kwame B.",   role: "200 leads in first week" },
  { initials: "TM", name: "Tobi M.",    role: "Landed 3 enterprise clients" },
];

function JoinForm() {
  const params = useSearchParams();

  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [phone,  setPhone]  = useState("");
  const [error,  setError]  = useState("");
  const [loading, setLoad]  = useState(false);
  const [done,   setDone]   = useState(false);

  // Google OAuth for funnel — after sign in we still need WhatsApp number
  const [showWaModal,  setShowWaModal]  = useState(false);
  const [googleUser,   setGoogleUser]   = useState<{ email: string; name: string } | null>(null);
  const [googleLoading, setGoogleLoad]  = useState(false);

  // UTM params
  const utmSource   = params.get("utm_source")   ?? undefined;
  const utmMedium   = params.get("utm_medium")   ?? undefined;
  const utmCampaign = params.get("utm_campaign") ?? undefined;
  const utmContent  = params.get("utm_content")  ?? undefined;
  const utmTerm     = params.get("utm_term")     ?? undefined;

  // ── Meta Pixel bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/public/funnel-settings")
      .then(r => r.json())
      .then((d: { pixel_id?: string }) => {
        const pixelId = d.pixel_id;
        if (!pixelId || window.fbq) return;

        // Load fbevents.js
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);

        // fbq stub so calls before load are queued
        const fbq = function (...args: unknown[]) {
          (fbq as unknown as { callMethod: (...a: unknown[]) => void; queue: unknown[] })
            .callMethod
            ? (fbq as unknown as { callMethod: (...a: unknown[]) => void }).callMethod(...args)
            : (fbq as unknown as { queue: unknown[] }).queue.push(args);
        };
        (fbq as unknown as { queue: unknown[]; loaded: boolean; version: string }).queue = [];
        (fbq as unknown as { loaded: boolean }).loaded = true;
        (fbq as unknown as { version: string }).version = "2.0";
        window._fbq = fbq;
        window.fbq  = fbq as (...args: unknown[]) => void;

        window.fbq("init", pixelId);
        window.fbq("track", "PageView");
      })
      .catch(() => {});
  }, []);

  function fireLeadEvent(emailAddr: string) {
    if (typeof window.fbq === "function") {
      window.fbq("track", "Lead", { content_name: "join_funnel", value: 0, currency: "NGN" });
      // Advanced matching — hash would be done server-side; browser version sends plain email
      window.fbq("track", "CompleteRegistration", { content_name: "join_funnel", email: emailAddr });
    }
  }

  // Check if user just returned from Google OAuth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data?.session;
      if (session?.user) {
        const user = session.user;
        // Check if they already have funnel_state (returning user)
        const { data: fs } = await supabase
          .from("funnel_states")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (fs) {
          window.location.href = "/free-training";
          return;
        }
        // New Google user — need WhatsApp number
        setGoogleUser({
          email: user.email ?? "",
          name:  user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "",
        });
        setShowWaModal(true);
      }
    });
  }, []);

  async function handleGoogle() {
    setGoogleLoad(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/join`,
        queryParams: {
          utm_source:   utmSource   ?? "",
          utm_medium:   utmMedium   ?? "",
          utm_campaign: utmCampaign ?? "",
        },
      },
    });
    if (error) { setError(error.message); setGoogleLoad(false); }
  }

  async function submitJoin(opts: {
    email: string; full_name: string; whatsapp_number: string;
  }) {
    const res = await fetch("/api/funnel/join", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opts,
        utm_source:   utmSource,
        utm_medium:   utmMedium,
        utm_campaign: utmCampaign,
        utm_content:  utmContent,
        utm_term:     utmTerm,
      }),
    });
    const d = await res.json() as { ok?: boolean; error?: string; existing?: boolean; redirect?: string };

    if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
    return d;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoad(true);
    try {
      const d = await submitJoin({ email, full_name: name, whatsapp_number: phone });
      fireLeadEvent(email);
      if (d.redirect) window.location.href = d.redirect;
      else setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoad(false);
    }
  }

  async function handleGoogleWaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoad(true);
    try {
      const d = await submitJoin({
        email:           googleUser!.email,
        full_name:       googleUser!.name,
        whatsapp_number: phone,
      });
      fireLeadEvent(googleUser!.email);
      if (d.redirect) window.location.href = d.redirect;
      else window.location.href = "/free-training";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoad(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#0a0a0a]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Check your email!</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            We sent a link to <strong className="text-white">{email}</strong>.{" "}
            Click it to access your free training.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* WhatsApp capture modal for Google users */}
      {showWaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-2">One last step</h3>
            <p className="text-gray-400 text-sm mb-6">
              Add your WhatsApp number so we can send you training reminders and updates.
            </p>
            <form onSubmit={handleGoogleWaSubmit} className="space-y-4">
              <input
                type="tel"
                placeholder="WhatsApp number with country code (e.g. +234...)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={loading || !phone}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
              >
                {loading ? "Setting up your access..." : "Get Free Access →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-orange-400 text-xs font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          Leadash × Learn By Mizark
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight max-w-3xl mb-5">
          Get the free training that{" "}
          <span className="text-orange-500">closes clients</span>{" "}
          in 30 days
        </h1>

        <p className="text-gray-400 text-lg max-w-xl mb-10">
          Watch the exact outreach system Mizark uses to generate ₦2M+ monthly —
          for free, right now.
        </p>

        {/* Social proof avatars */}
        <div className="flex items-center gap-3 mb-12">
          <div className="flex -space-x-2">
            {SOCIAL_PROOF.map(p => (
              <div key={p.initials}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-[#0a0a0a]"
                style={{ background: "linear-gradient(135deg, #f97316, #dc2626)" }}>
                {p.initials}
              </div>
            ))}
          </div>
          <p className="text-gray-400 text-sm">
            <strong className="text-white">500+</strong> students already watching
          </p>
        </div>

        {/* Opt-in form */}
        <div className="w-full max-w-md">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-1">Get instant free access</h2>
            <p className="text-gray-400 text-sm mb-6">No credit card needed.</p>

            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-semibold py-3 rounded-lg text-sm transition-colors mb-4"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-gray-500 text-xs">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
              <input
                type="tel"
                placeholder="WhatsApp number (e.g. +234 801 234 5678)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              />
              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "Creating your access..." : "Watch the Free Training →"}
              </button>
            </form>

            <p className="text-gray-500 text-xs text-center mt-4">
              By signing up you agree to our{" "}
              <a href="/terms" className="text-gray-400 underline underline-offset-2">Terms</a>{" "}
              and{" "}
              <a href="/privacy" className="text-gray-400 underline underline-offset-2">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div className="border-t border-white/5 py-12 px-4">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {SOCIAL_PROOF.map(p => (
            <div key={p.initials} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <p className="text-sm text-gray-300 mb-4">&ldquo;This training changed how I approach clients completely.&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #f97316, #dc2626)" }}>
                  {p.initials}
                </div>
                <div>
                  <p className="text-white text-xs font-semibold">{p.name}</p>
                  <p className="text-orange-400 text-xs">{p.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
