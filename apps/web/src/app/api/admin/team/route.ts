/**
 * GET    /api/admin/team — list current admins + pending invites + presets
 * POST   /api/admin/team — invite a new team member (built-in role OR preset)
 * DELETE /api/admin/team — remove a team member or revoke an invite
 *
 * Gated by the `team_config` module. Previously this required super_admin,
 * but with the new module-based permissions an admin granted team_config
 * via a custom preset can also manage the team.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminContext, requireAdminModule } from "@/lib/admin/auth";
import {
  BUILTIN_ROLES, ALL_MODULE_KEYS, isAlwaysOnModule,
  resolveModules, type AdminModuleKey, type AdminRole,
} from "@/lib/admin/modules";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const FROM    = process.env.RESEND_FROM_EMAIL ?? "no-reply@notifications.leadash.com";

function sanitizeModules(input: unknown): AdminModuleKey[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(ALL_MODULE_KEYS);
  const out: AdminModuleKey[] = [];
  for (const m of input) {
    if (typeof m === "string" && allowed.has(m)) out.push(m as AdminModuleKey);
  }
  return out.filter(m => !isAlwaysOnModule(m));
}

export async function GET() {
  // Any admin can see the team list. Mutation routes (POST/DELETE) require team_config.
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: admins } = await ctx.db
    .from("admins")
    .select("user_id, role, preset_id, permissions, added_at");

  // Enrich admin rows with email/name from auth.users
  const { data: { users: allUsers } } = await ctx.db.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, { email: string; name: string | null }>(
    allUsers.map((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => [
      u.id,
      { email: u.email ?? "", name: (u.user_metadata?.full_name as string | undefined) ?? null },
    ])
  );

  const enriched = (admins ?? []).map((a: { user_id: string; role: string; preset_id: string | null; permissions: unknown; added_at: string }) => ({
    user_id:     a.user_id,
    role:        a.role,
    preset_id:   a.preset_id,
    permissions: Array.isArray(a.permissions) ? a.permissions : [],
    added_at:    a.added_at,
    email:       userMap.get(a.user_id)?.email ?? "",
    name:        userMap.get(a.user_id)?.name  ?? null,
    is_you:      a.user_id === ctx.user.id,
  }));

  // Pending invites — open and not yet expired
  const { data: invites } = await ctx.db
    .from("admin_invites")
    .select("id, email, role, preset_id, permissions, invited_at, expires_at")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("invited_at", { ascending: false });

  // Custom presets — useful both for displaying preset names on admin rows
  // and for populating the invite role dropdown.
  const { data: presets } = await ctx.db
    .from("admin_role_presets")
    .select("id, name, modules")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    admins:  enriched,
    invites: invites ?? [],
    presets: presets ?? [],
    myRole:  ctx.role,
    myModules: Array.from(ctx.modules),
    canManageTeam: ctx.modules.has("team_config"),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });

  const body = await req.json() as {
    email?: string;
    role?: string;
    preset_id?: string | null;
    permissions?: unknown;
  };
  const email     = body.email?.trim();
  const role      = (body.role ?? "readonly") as AdminRole;
  const presetId  = body.preset_id ?? null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!BUILTIN_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${BUILTIN_ROLES.join(", ")}` }, { status: 400 });
  }

  // Resolve the permissions stored on the invite:
  //  - built-in role: derived live at admin context time, so we store an empty list
  //  - custom + preset: lookup the preset's modules now (the preset_id is the source of truth)
  //  - custom + no preset: caller must pass explicit modules
  let permissions: AdminModuleKey[] = [];
  let resolvedPresetId: string | null = null;

  if (role === "custom") {
    if (presetId) {
      const { data: preset } = await ctx.db
        .from("admin_role_presets")
        .select("modules")
        .eq("id", presetId)
        .maybeSingle();
      if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      resolvedPresetId = presetId;
      permissions      = sanitizeModules(preset.modules);
    } else {
      permissions = sanitizeModules(body.permissions);
      if (!permissions.length) {
        return NextResponse.json({ error: "Pick at least one module or choose a preset" }, { status: 400 });
      }
    }
  }

  // Cancel any existing open invite for the same email so the latest wins
  await ctx.db.from("admin_invites").delete()
    .eq("email", email.toLowerCase())
    .is("accepted_at", null);

  const { data: invite, error } = await ctx.db
    .from("admin_invites")
    .insert({
      email:       email.toLowerCase(),
      role,
      preset_id:   resolvedPresetId,
      permissions,
      invited_by:  ctx.user.id,
    })
    .select("id, email, role, token, permissions, preset_id, expires_at")
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? "Failed to create invite" }, { status: 500 });
  }

  // Send the invite email. We surface any failure back to the UI now instead
  // of silently swallowing it — the previous version did `.catch(() => null)`
  // which made bad sender domains / unverified Resend setups impossible to
  // diagnose from the dashboard.
  const apiKey = process.env.RESEND_API_KEY;
  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailError: string | null = null;

  if (!apiKey) {
    emailError = "RESEND_API_KEY is not configured — invite email was not sent.";
    console.error("[admin/team] " + emailError);
  } else {
    const acceptUrl = `${APP_URL}/admin/accept-invite?token=${invite.token}`;
    const roleLabel = role === "custom" ? "custom" : role;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Match the sender format used by other working Resend calls in this
          // codebase ("Leadash <…>") so we share whatever verified domain config
          // they rely on, instead of inventing a new sender that might not be
          // allowlisted on Resend.
          from:    `Leadash <${FROM}>`,
          to:      [invite.email],
          subject: "You've been invited to the Leadash admin panel",
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
              <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px 32px;border-radius:12px 12px 0 0">
                <p style="margin:0;font-size:20px;font-weight:700;color:#fff">Leadash Admin</p>
              </div>
              <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:32px">
                <p style="font-size:15px;color:#1e293b">You've been invited to join the Leadash admin panel as <strong>${roleLabel}</strong>.</p>
                <p style="font-size:14px;color:#64748b">Click the button below to accept your invitation. This link expires in 7 days.</p>
                <a href="${acceptUrl}" style="display:inline-block;margin:16px 0;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                  Accept Invitation →
                </a>
                <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px">
                  If you did not expect this invitation, you can safely ignore this email.
                </p>
              </div>
            </div>
          `,
          text: `You've been invited to the Leadash admin panel as ${roleLabel}.\n\nAccept your invitation:\n${acceptUrl}\n\nThis link expires in 7 days.`,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        emailError  = `Resend ${res.status}: ${body.slice(0, 300)}`;
        emailStatus = "failed";
        console.error("[admin/team] invite email failed:", emailError);
      } else {
        emailStatus = "sent";
      }
    } catch (e) {
      emailError  = e instanceof Error ? e.message : String(e);
      emailStatus = "failed";
      console.error("[admin/team] invite email threw:", emailError);
    }
  }

  const { token: _token, ...safeInvite } = invite;
  return NextResponse.json({
    ok:           true,
    invite:       safeInvite,
    email_status: emailStatus,
    email_error:  emailError,
    accept_url:   emailStatus === "sent" ? null : `${APP_URL}/admin/accept-invite?token=${invite.token}`,
  });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdminModule("team_config");
  if (!ctx) return NextResponse.json({ error: "Forbidden — team_config required" }, { status: 403 });

  const body = await req.json() as { user_id?: string; invite_id?: string };

  if (body.invite_id) {
    await ctx.db.from("admin_invites").delete().eq("id", body.invite_id);
    return NextResponse.json({ ok: true });
  }

  if (body.user_id) {
    if (body.user_id === ctx.user.id) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }
    // Refuse to remove the last super_admin so the platform can't be locked out
    const { count: superCount } = await ctx.db
      .from("admins")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "super_admin");
    const { data: target } = await ctx.db
      .from("admins")
      .select("role")
      .eq("user_id", body.user_id)
      .maybeSingle();
    if (target?.role === "super_admin" && (superCount ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot remove the last super_admin" }, { status: 400 });
    }
    await ctx.db.from("admins").delete().eq("user_id", body.user_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "user_id or invite_id required" }, { status: 400 });
}

// Suppress unused warning for the unused intermediate resolveModules import
// (kept for future per-action enforcement; safe to remove later).
void resolveModules;
