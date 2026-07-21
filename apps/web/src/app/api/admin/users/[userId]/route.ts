import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";
import { generateTempPassword } from "@/lib/admin/generate-password";
import { sendAdminResetPasswordEmail } from "@/lib/email/notifications";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

// GET /api/admin/users/[userId]
export async function GET(_: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;

  const { data: { user: target }, error } = await ctx.adminClient.auth.admin.getUserById(userId);
  if (error || !target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [
    { data: workspaces },
    { data: campaigns },
    { data: creditTxns },
    { data: tickets },
  ] = await Promise.all([
    ctx.adminClient.from("workspaces").select("id, name, plan_id, plan_status, lead_credits_balance, created_at, stripe_customer_id, sends_this_month, max_monthly_sends, max_inboxes").eq("owner_id", userId),
    ctx.adminClient.from("lead_campaigns").select("id, name, status, total_scraped, credits_used, created_at").eq("workspace_id",
      // Get workspace IDs for this user
      ctx.adminClient.from("workspaces").select("id").eq("owner_id", userId)
    ).order("created_at", { ascending: false }).limit(10),
    ctx.adminClient.from("lead_credit_transactions").select("id, amount, type, description, created_at").order("created_at", { ascending: false }).limit(20),
    ctx.adminClient.from("support_tickets").select("id, subject, status, priority, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    user: {
      id: target.id,
      email: target.email,
      name: (target.user_metadata?.full_name as string) ?? null,
      created_at: target.created_at,
      last_sign_in_at: target.last_sign_in_at,
      email_confirmed: !!target.email_confirmed_at,
      banned_until: target.banned_until ?? null,
      user_metadata: target.user_metadata,
    },
    workspaces: workspaces ?? [],
    tickets: tickets ?? [],
  });
}

// PATCH /api/admin/users/[userId] — ban / unban / reset password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;
  const body = await req.json();

  if (body.action === "ban") {
    const { error } = await ctx.adminClient.auth.admin.updateUserById(userId, {
      ban_duration: body.duration ?? "876600h", // 100 years
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unban") {
    const { error } = await ctx.adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset_password") {
    // Admin-initiated reset: generate a strong temp password, force
    // must_change_password on next login, email plaintext to the user, and
    // return the password once so the admin UI can also display it.
    const { data: { user: target } } = await ctx.adminClient.auth.admin.getUserById(userId);
    if (!target?.email) return NextResponse.json({ error: "No email" }, { status: 400 });

    const tempPassword = generateTempPassword(14);
    const existingMeta = (target.user_metadata as Record<string, unknown>) ?? {};
    const { error } = await ctx.adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
      user_metadata: { ...existingMeta, must_change_password: true },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let emailStatus: "sent" | "failed" = "sent";
    let emailError: string | null = null;
    try {
      await sendAdminResetPasswordEmail({
        userEmail:    target.email,
        userName:     (existingMeta.full_name as string | undefined) ?? null,
        tempPassword,
      });
    } catch (e: unknown) {
      emailStatus = "failed";
      emailError  = e instanceof Error ? e.message : "Email delivery failed";
      console.error("[admin/users reset] email failed:", e);
    }

    return NextResponse.json({
      ok: true,
      temp_password: tempPassword,
      email_status:  emailStatus,
      email_error:   emailError,
    });
  }

  if (body.action === "update_profile") {
    // Update editable identity fields. Email + name land on auth.users; phone
    // lands in user_metadata and propagates to the linked crm_contacts row
    // so inbound WhatsApp still resolves. Email change bypasses Supabase's
    // confirmation flow — admin action is authoritative.
    const { data: { user: target } } = await ctx.adminClient.auth.admin.getUserById(userId);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const patch: {
      email?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    } = {};
    const existingMeta = (target.user_metadata as Record<string, unknown>) ?? {};
    const nextMeta: Record<string, unknown> = { ...existingMeta };

    if (typeof body.email === "string" && body.email.trim().toLowerCase() !== (target.email ?? "").toLowerCase()) {
      const newEmail = body.email.trim().toLowerCase();
      if (!newEmail.includes("@")) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
      }
      // Duplicate check against other users
      const { data: { users: others } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
      const dup = (others as { id: string; email?: string }[]).find(u => u.id !== userId && (u.email ?? "").toLowerCase() === newEmail);
      if (dup) return NextResponse.json({ error: "Another user already has this email." }, { status: 409 });
      patch.email = newEmail;
      patch.email_confirm = true;
    }

    if (typeof body.full_name === "string") {
      nextMeta.full_name = body.full_name.trim() || null;
    }

    let newPhone: string | null | undefined;
    if (body.phone !== undefined) {
      newPhone = body.phone === null || body.phone === "" ? null : normalisePhone(body.phone);
      nextMeta.phone = newPhone;
    }

    patch.user_metadata = nextMeta;

    const { data: updated, error: updErr } = await ctx.adminClient.auth.admin.updateUserById(userId, patch);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // Propagate identity changes to the linked crm_contacts row (matched by
    // user_id first; fall back to old email so a rename doesn't orphan the
    // contact). Only overwrite fields the admin actually changed.
    const contactPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.email !== undefined) contactPatch.email = patch.email;
    if (typeof body.full_name === "string") contactPatch.display_name = body.full_name.trim() || null;
    if (body.phone !== undefined) contactPatch.whatsapp_number = newPhone ?? null;

    if (Object.keys(contactPatch).length > 1) {
      // Prefer user_id match; if none, try old email.
      const { data: byUser } = await ctx.adminClient.from("crm_contacts").select("id").eq("user_id", userId).limit(1).maybeSingle();
      const contactId = (byUser?.id as string | undefined)
        ?? (target.email
              ? ((await ctx.adminClient.from("crm_contacts").select("id").eq("email", target.email).limit(1).maybeSingle()).data?.id as string | undefined)
              : undefined);
      if (contactId) {
        await ctx.adminClient.from("crm_contacts").update(contactPatch).eq("id", contactId);
      }
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: updated?.user?.id ?? userId,
        email: updated?.user?.email ?? patch.email ?? target.email,
        name:  (nextMeta.full_name as string | null | undefined) ?? null,
        phone: (nextMeta.phone as string | null | undefined) ?? null,
      },
    });
  }

  if (body.action === "delete") {
    // Block deletion if user owns workspaces with active subscriptions
    const { data: activeWs } = await ctx.adminClient
      .from("workspaces")
      .select("id, name, plan_status")
      .eq("owner_id", userId)
      .in("plan_status", ["active", "trial"]);
    if (activeWs && activeWs.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete user with ${activeWs.length} active subscription(s). Cancel all subscriptions first.` },
        { status: 409 },
      );
    }
    const { error } = await ctx.adminClient.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
