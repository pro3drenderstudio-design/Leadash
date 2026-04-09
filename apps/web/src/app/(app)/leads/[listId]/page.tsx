import { createClient } from "@supabase/supabase-js";

async function getList(listId: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const [{ data: list }, { data: leads, count }] = await Promise.all([
    supabase.from("outreach_lists").select("*").eq("id", listId).single(),
    supabase.from("outreach_leads").select("*", { count: "exact" }).eq("list_id", listId).order("created_at", { ascending: false }).limit(500),
  ]);
  return { list, leads: leads ?? [], total: count ?? 0 };
}

export default async function ListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const { list, leads, total } = await getList(listId);

  if (!list) return <div className="p-6 text-white/40">List not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">{list.name}</h1>
        <p className="text-white/40 text-sm mt-0.5">{total.toLocaleString()} leads</p>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p>No leads in this list yet. Import a CSV from the Leads page.</p>
        </div>
      ) : (
        <div className="border border-white/8 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr] gap-4 px-4 py-2.5 bg-white/3 border-b border-white/6">
            {["Email", "Name", "Company / Title", "Status", "Added"].map((h) => (
              <div key={h} className="text-white/35 text-xs font-semibold uppercase tracking-wider">{h}</div>
            ))}
          </div>
          {leads.slice(0, 200).map((lead, i) => (
            <div key={lead.id} className={`grid grid-cols-[2fr_2fr_2fr_1fr_1fr] gap-4 px-4 py-3 border-b border-white/4 last:border-0 ${i % 2 === 0 ? "" : "bg-white/1"}`}>
              <div className="text-white/80 text-sm truncate">{lead.email}</div>
              <div className="text-white/60 text-sm truncate">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}</div>
              <div className="text-white/50 text-sm truncate">{[lead.company, lead.title].filter(Boolean).join(" · ") || "—"}</div>
              <div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${lead.status === "active" ? "bg-green-500/15 text-green-400" : lead.status === "bounced" ? "bg-red-500/15 text-red-400" : "bg-white/10 text-white/40"}`}>
                  {lead.status}
                </span>
              </div>
              <div className="text-white/30 text-xs">{new Date(lead.created_at).toLocaleDateString()}</div>
            </div>
          ))}
          {total > 200 && (
            <div className="px-4 py-3 text-white/30 text-xs border-t border-white/6">
              Showing first 200 of {total.toLocaleString()} leads
            </div>
          )}
        </div>
      )}
    </div>
  );
}
