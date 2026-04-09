"use client";
import { useState } from "react";
import { setWorkspaceId } from "@/lib/workspace/client";

export default function OnboardingPage() {
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok || data.error) { setError(data.error ?? "Failed to create workspace"); setLoading(false); return; }

    setWorkspaceId(data.id);
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Welcome to Leadash</h1>
          <p className="text-gray-400 text-sm mt-2">Let's set up your workspace to get started.</p>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Name your workspace</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Workspace name</label>
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Acme Corp"
              />
              <p className="text-xs text-gray-500 mt-1">This can be your company name or team name.</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading || !name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Creating…" : "Create workspace →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
