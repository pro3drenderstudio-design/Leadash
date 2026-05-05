import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return db;
}

// GET /api/admin/postal-nodes
// Returns all nodes with live inbox/domain counts.
export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: nodes, error } = await db
    .from("postal_nodes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each node with live counts
  const enriched = await Promise.all((nodes ?? []).map(async (node: Record<string, unknown>) => {
    const [{ count: inboxCount }, { count: domainCount }, workspaceRow] = await Promise.all([
      db.from("outreach_inboxes")
        .select("id", { count: "exact", head: true })
        .eq("postal_node_id", node.id)
        .eq("status", "active"),
      db.from("outreach_domains")
        .select("id", { count: "exact", head: true })
        .eq("postal_node_id", node.id as string),
      node.workspace_id
        ? db.from("workspaces").select("id, name").eq("id", node.workspace_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const used  = inboxCount ?? 0;
    const limit = node.inbox_limit as number;
    return {
      ...node,
      inbox_count:   used,
      domain_count:  domainCount ?? 0,
      pct:           limit > 0 ? Math.round((used / limit) * 100) : 0,
      workspace:     (workspaceRow as { data: { id: string; name: string } | null }).data ?? null,
    };
  }));

  return NextResponse.json({ nodes: enriched });
}

// POST /api/admin/postal-nodes
// Add a new node.
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    label:            string;
    ip_address:       string;
    is_shared:        boolean;
    inbox_limit?:     number;
    workspace_id?:    string | null;
    postal_server_id?: number | null;
    postal_pool_id?:   number | null;
    notes?:           string | null;
  };

  if (!body.label?.trim() || !body.ip_address?.trim()) {
    return NextResponse.json({ error: "label and ip_address are required" }, { status: 400 });
  }

  const { data, error } = await db.from("postal_nodes").insert({
    label:            body.label.trim(),
    ip_address:       body.ip_address.trim(),
    is_shared:        body.is_shared ?? true,
    inbox_limit:      body.inbox_limit ?? (body.is_shared ? 150 : 100),
    workspace_id:     body.workspace_id ?? null,
    postal_server_id: body.postal_server_id ?? null,
    postal_pool_id:   body.postal_pool_id   ?? null,
    notes:            body.notes ?? null,
    status:           "provisioning",
  }).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "IP address already registered" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ node: data }, { status: 201 });
}
