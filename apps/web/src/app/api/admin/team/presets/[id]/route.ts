/**
 * PATCH  /api/admin/team/presets/[id] — rename or update modules on a preset
 * DELETE /api/admin/team/presets/[id] — delete a preset (blocked if any admin uses it)
 *
 * Edits to a preset propagate live to every admin assigned to it, because the
 * admin context helper re-resolves modules from the preset on every request.
 * Deletes are blocked at the DB layer (FK ON DELETE RESTRICT) — we just catch
 * the 23503 error and return a friendly message.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminModule } from "@/lib/admin/auth";
import { ALL_MODULE_KEYS, isAlwaysOnModule, type AdminModuleKey } from "@/lib/admin/modules";

function sanitizeModules(input: unknown): AdminModuleKey[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(ALL_MODULE_KEYS);
  const out: AdminModuleKey[] = [];
  for (const m of input) {
    if (typeof m === "string" && allowed.has(m)) out.push(m as AdminModuleKey);
  }
  return out.filter(m => !isAlwaysOnModule(m));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });
  const { id } = await params;

  const body = await req.json() as { name?: string; modules?: unknown };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    if (trimmed.length > 60) return NextResponse.json({ error: "name must be 60 characters or fewer" }, { status: 400 });
    update.name = trimmed;
  }
  if (body.modules !== undefined) {
    const modules = sanitizeModules(body.modules);
    if (!modules.length) return NextResponse.json({ error: "Pick at least one module" }, { status: 400 });
    update.modules = modules;
  }

  const { data, error } = await ctx.db
    .from("admin_role_presets")
    .update(update)
    .eq("id", id)
    .select("id, name, modules, created_at, updated_at")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A preset with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ preset: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });
  const { id } = await params;

  // Surface a clean error before hitting the FK so the UI can show usage info
  const { count } = await ctx.db
    .from("admins")
    .select("user_id", { count: "exact", head: true })
    .eq("preset_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `This preset is assigned to ${count} admin${count === 1 ? "" : "s"}. Reassign them before deleting.` },
      { status: 409 },
    );
  }

  const { error } = await ctx.db.from("admin_role_presets").delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation — defence in depth in case a race added an admin between checks
    if ((error as { code?: string }).code === "23503") {
      return NextResponse.json({ error: "This preset is still in use — reassign admins before deleting." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
