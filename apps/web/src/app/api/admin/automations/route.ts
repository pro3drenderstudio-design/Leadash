/**
 * GET  /api/admin/automations          — list all flows
 * POST /api/admin/automations          — create new flow
 * PATCH /api/admin/automations?id=xxx  — update flow (definition, name, active, duplicate_policy)
 * DELETE /api/admin/automations?id=xxx — soft-delete (set is_active=false, not actually deleted)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await ctx.db
    .from("automation_flows")
    .select("id, name, description, trigger_event, duplicate_policy, is_active, version, last_published_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description, trigger_event, duplicate_policy } = await req.json() as {
    name: string;
    description?: string;
    trigger_event: string;
    duplicate_policy?: "deduplicate" | "parallel" | "restart";
  };

  if (!name?.trim()) return NextResponse.json({ error: "Flow name is required" }, { status: 400 });
  if (!trigger_event?.trim()) return NextResponse.json({ error: "Trigger event is required" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("automation_flows")
    .insert({
      name:             name.trim(),
      description:      description?.trim() ?? null,
      trigger_event:    trigger_event.trim(),
      duplicate_policy: duplicate_policy ?? "deduplicate",
      flow_definition:  { nodes: [], edges: [] },
      is_active:        false,
      version:          1,
      created_by:       ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json() as {
    name?: string;
    description?: string;
    trigger_event?: string;
    duplicate_policy?: string;
    flow_definition?: object;
    is_active?: boolean;
    force_migrate_executions?: boolean;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name            != null) patch.name             = body.name.trim();
  if (body.description     != null) patch.description      = body.description.trim() || null;
  if (body.trigger_event   != null) patch.trigger_event    = body.trigger_event.trim();
  if (body.duplicate_policy != null) patch.duplicate_policy = body.duplicate_policy;
  if (body.is_active       != null) patch.is_active        = body.is_active;

  if (body.flow_definition != null) {
    // Publishing a new version: snapshot the old, bump version
    const { data: current } = await ctx.db
      .from("automation_flows")
      .select("version, flow_definition, is_active")
      .eq("id", id)
      .single();

    if (current) {
      // Snapshot current version before overwriting
      await ctx.db.from("automation_flow_versions").upsert({
        flow_id:         id,
        version:         current.version,
        flow_definition: current.flow_definition,
        published_at:    new Date().toISOString(),
      }, { onConflict: "flow_id,version", ignoreDuplicates: true });

      patch.flow_definition    = body.flow_definition;
      patch.version            = (current.version as number) + 1;
      patch.last_published_at  = new Date().toISOString();

      // If force_migrate_executions, update running executions to new version
      if (body.force_migrate_executions) {
        await ctx.db.from("automation_executions")
          .update({ flow_version: patch.version as number })
          .eq("flow_id", id)
          .in("status", ["running", "paused"]);
      }
    } else {
      patch.flow_definition = body.flow_definition;
    }
  }

  const { error } = await ctx.db.from("automation_flows").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Deactivate rather than delete — preserves execution history
  const { error } = await ctx.db.from("automation_flows")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
