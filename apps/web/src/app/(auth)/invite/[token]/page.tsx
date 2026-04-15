"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite]   = useState<{ workspace_name: string; email: string } | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/invites/${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setInvite(d); })
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setAccepting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = `/signup?inviteToken=${token}`;
      return;
    }
    const res = await fetch(`/api/workspaces/invites/${token}/accept`, { method: "POST" });
    const data = await res.json();
    if (data.error) { setError(data.error); setAccepting(false); }
    else window.location.href = "/dashboard";
  }

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-9"><img src="/logo.svg" alt="Leadash" className="h-10 w-auto" /></div>
        {children}
      </div>
    </div>
  );

  if (loading) return <Wrap><div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center text-white/40">Loading…</div></Wrap>;
  if (error)   return <Wrap><div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center text-red-400">{error}</div></Wrap>;
  if (!invite) return null;

  return (
    <Wrap>
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 text-center">
      <h2 className="text-xl font-semibold text-white mb-2">You're invited!</h2>
      <p className="text-gray-400 text-sm mb-6">
        Join <span className="text-white font-medium">{invite.workspace_name}</span> on Leadash
      </p>
      <button
        onClick={accept} disabled={accepting}
        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
      >
        {accepting ? "Joining…" : "Accept invitation"}
      </button>
    </div>
    </Wrap>
  );
}
