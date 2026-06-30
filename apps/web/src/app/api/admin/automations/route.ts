/**
 * GET  /api/admin/automations                    — list all flows
 * GET  /api/admin/automations?type=templates      — list system templates
 * GET  /api/admin/automations?type=executions&flow_id=xxx — list executions with steps
 * POST /api/admin/automations                    — create new flow
 * POST /api/admin/automations (from_template_id) — create from template
 * PATCH /api/admin/automations?id=xxx            — update flow (definition, name, active, duplicate_policy)
 * DELETE /api/admin/automations?id=xxx           — soft-delete (set is_active=false, not actually deleted)
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

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type    = req.nextUrl.searchParams.get("type");
  const flowId  = req.nextUrl.searchParams.get("flow_id");

  // ── Templates ──────────────────────────────────────────────────────────────
  if (type === "templates") {
    const { data, error } = await ctx.db
      .from("automation_templates")
      .select("id, name, description, category, preview_img, definition, is_system, created_at")
      .eq("is_system", true)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
  }

  // ── Executions ─────────────────────────────────────────────────────────────
  if (type === "executions") {
    if (!flowId) return NextResponse.json({ error: "flow_id required" }, { status: 400 });

    const { data, error } = await ctx.db
      .from("automation_executions")
      .select(`
        id,
        status,
        started_at,
        completed_at,
        contact_id,
        chain_depth,
        next_run_at,
        automation_execution_steps (
          id,
          node_id,
          node_type,
          status,
          started_at,
          completed_at,
          skip_reason,
          output
        )
      `)
      .eq("flow_id", flowId)
      .order("started_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ executions: data ?? [] });
  }

  // ── Flows list ─────────────────────────────────────────────────────────────
  const { data, error } = await ctx.db
    .from("automation_flows")
    .select("id, name, description, trigger_event, duplicate_policy, flow_definition, is_active, version, last_published_at, run_count, last_run_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    name?: string;
    description?: string;
    trigger_event?: string;
    duplicate_policy?: "deduplicate" | "parallel" | "restart";
    from_template_id?: string;
  };

  // ── Create from template ───────────────────────────────────────────────────
  if (body.from_template_id) {
    const { data: tmpl, error: tmplErr } = await ctx.db
      .from("automation_templates")
      .select("id, name, description, definition")
      .eq("id", body.from_template_id)
      .single();

    if (tmplErr || !tmpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const name = body.name?.trim() || tmpl.name;
    const { data, error } = await ctx.db
      .from("automation_flows")
      .insert({
        name,
        description:      tmpl.description ?? null,
        trigger_event:    (tmpl.definition as Record<string, unknown>)?.trigger_event as string ?? "custom",
        duplicate_policy: "deduplicate",
        flow_definition:  tmpl.definition,
        template_id:      body.from_template_id,
        is_active:        false,
        version:          1,
        created_by:       ctx.user.id,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  // ── Create blank flow ──────────────────────────────────────────────────────
  const { name, description, trigger_event, duplicate_policy } = body;

  if (!name?.trim())         return NextResponse.json({ error: "Flow name is required" }, { status: 400 });
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
