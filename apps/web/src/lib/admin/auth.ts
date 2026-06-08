/**
 * Server-side admin auth helpers. Centralises the "is this request from an
 * admin, and what modules do they have?" logic so API routes don't each
 * re-implement it (and drift apart).
 *
 * Usage in a route handler:
 *   const ctx = await getAdminContext();
 *   if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 *   if (!ctx.modules.has("team_config")) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });
 *
 * For routes that just need any admin: getAdminContext() === null → 403.
 * For module-gated routes: use requireAdminModule(moduleKey).
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveModules,
  type AdminModuleKey,
  type AdminRole,
} from "@/lib/admin/modules";

export type AdminContext = {
  user: { id: string; email: string | null };
  role: AdminRole;
  /** The preset_id this admin is bound to, if any (only meaningful when role='custom'). */
  presetId: string | null;
  /** Modules granted directly on the admins row (used only when role='custom' and no preset is bound). */
  customModulesRaw: string[];
  /** Resolved set of modules the admin can access (live-merged with the preset if one is bound). */
  modules: Set<AdminModuleKey>;
  db: SupabaseClient;
};

/**
 * Returns the active admin context, or null if the request isn't from an admin.
 * "Custom" admins with a preset_id get their modules live-resolved from the
 * preset row, so edits to a preset propagate to all admins on it immediately.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createAdminClient();
  const { data: admin } = await db
    .from("admins")
    .select("role, permissions, preset_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!admin) return null;

  // If the admin is bound to a preset, the preset's modules trump anything
  // snapshotted on the admin row — this is what makes "edits propagate live".
  let customModules: string[] = Array.isArray(admin.permissions) ? admin.permissions as string[] : [];
  if (admin.preset_id) {
    const { data: preset } = await db
      .from("admin_role_presets")
      .select("modules")
      .eq("id", admin.preset_id)
      .maybeSingle();
    if (preset?.modules) customModules = preset.modules as string[];
  }

  return {
    user:             { id: user.id, email: user.email ?? null },
    role:             admin.role as AdminRole,
    presetId:         admin.preset_id ?? null,
    customModulesRaw: Array.isArray(admin.permissions) ? admin.permissions as string[] : [],
    modules:          resolveModules(admin.role as string, customModules),
    db,
  };
}

/**
 * Convenience wrapper for routes that need a specific module. Returns the
 * context on success or null when access should be denied — callers convert
 * null into a 403 response.
 */
export async function requireAdminModule(moduleKey: AdminModuleKey): Promise<AdminContext | null> {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  if (!ctx.modules.has(moduleKey)) return null;
  return ctx;
}
