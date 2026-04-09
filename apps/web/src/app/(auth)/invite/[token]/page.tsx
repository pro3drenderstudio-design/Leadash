"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

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
    const supabase = createBrowserClient();
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

  if (loading) return <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center text-gray-400">Loading…</div>;
  if (error)   return <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center text-red-400">{error}</div>;
  if (!invite) return null;

  return (
    <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
      <h2 className="text-xl font-semibold text-white mb-2">You're invited!</h2>
      <p className="text-gray-400 text-sm mb-6">
        Join <span className="text-white font-medium">{invite.workspace_name}</span> on Leadash
      </p>
      <button
        onClick={accept} disabled={accepting}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
      >
        {accepting ? "Joining…" : "Accept invitation"}
      </button>
    </div>
  );
}
