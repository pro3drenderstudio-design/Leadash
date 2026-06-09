/**
 * GET  /api/admin/team/presets — list custom presets with admin usage counts
 * POST /api/admin/team/presets — create a new custom preset
 *
 * Gated by the `team_config` module. The 4 built-in roles (super_admin, support,
 * billing, readonly) are NOT stored here — they're hardcoded in the modules
 * catalog so they can't be deleted by accident. Only user-created custom
 * templates live in this table.
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
  // Always-on modules (Overview) are implicit — strip them from storage so they
  // don't appear redundantly when editing later.
  return out.filter(m => !isAlwaysOnModule(m));
}

export async function GET() {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });

  const { data: presets, error } = await ctx.db
    .from("admin_role_presets")
    .select("id, name, modules, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count how many admins reference each preset — drives the UI's "in use" badge
  // and disables the delete button when a preset can't be removed.
  const { data: usage } = await ctx.db
    .from("admins")
    .select("preset_id")
    .not("preset_id", "is", null);
  const usageCounts = new Map<string, number>();
  for (const row of usage ?? []) {
    const id = (row as { preset_id: string }).preset_id;
    usageCounts.set(id, (usageCounts.get(id) ?? 0) + 1);
  }

  const enriched = (presets ?? []).map(p => ({
    ...p,
    in_use_count: usageCounts.get(p.id) ?? 0,
  }));

  return NextResponse.json({ presets: enriched });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });

  const body = await req.json() as { name?: string; modules?: unknown };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "name must be 60 characters or fewer" }, { status: 400 });

  const modules = sanitizeModules(body.modules);
  if (!modules.length) return NextResponse.json({ error: "Pick at least one module" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("admin_role_presets")
    .insert({ name, modules, created_by: ctx.user.id })
    .select("id, name, modules, created_at, updated_at")
    .single();

  if (error) {
    // 23505 = unique_violation on the case-insensitive name index
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: `A preset named "${name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preset: data }, { status: 201 });
}
