import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";
import { generateTempPassword } from "@/lib/admin/generate-password";
import { sendWelcomeAccountEmail } from "@/lib/email/notifications";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolveName(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  if (str(meta.full_name))  return str(meta.full_name);
  const name = (str(meta.first_name) + " " + str(meta.last_name)).trim();
  return name || null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page   = parseInt(searchParams.get("page")  ?? "1");
  const search = searchParams.get("search") ?? "";
  const plan   = searchParams.get("plan")   ?? "";
  const perPage = 25;

  // Fetch auth users (Supabase Admin API, max 1000 at once)
  const { data: { users: allUsers } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });

  // Fetch all workspaces to enrich
  const { data: workspaces } = await ctx.adminClient
    .from("workspaces")
    .select("id, owner_id, plan_id, name, lead_credits_balance, created_at");

  type WsRow = { id: string; owner_id: string; plan_id: string | null; name: string; lead_credits_balance: number | null; created_at: string };
  const wsRows = (workspaces ?? []) as WsRow[];
  const wsMap = new Map<string, WsRow[]>();
  wsRows.forEach(w => {
    const arr = wsMap.get(w.owner_id) ?? [];
    arr.push(w);
    wsMap.set(w.owner_id, arr);
  });

  type AuthUser = { id: string; email?: string; user_metadata: Record<string, unknown>; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null };

  // Enrich users
  let enriched = (allUsers as AuthUser[]).map(u => ({
    id:         u.id,
    email:      u.email ?? "",
    name:       resolveName(u.user_metadata),
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed: !!u.email_confirmed_at,
    banned:     !!u.banned_until,
    workspaces: wsMap.get(u.id) ?? [],
  }));

  // Filter
  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(u => u.email.toLowerCase().includes(s) || u.name?.toLowerCase().includes(s));
  }
  if (plan) {
    enriched = enriched.filter(u => u.workspaces.some(w => w.plan_id === plan));
  }

  // Sort newest first
  enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = enriched.length;
  const users = enriched.slice((page - 1) * perPage, page * perPage);

  return NextResponse.json({ users, total, page, perPage });
}

// POST /api/admin/users — admin-initiated account creation.
// Generates a strong temp password, creates the auth user with the
// must_change_password flag set, upserts a matching crm_contacts row so the
// user is reachable via WhatsApp inbound, and emails the plaintext password
// to the user. The password is also returned once in the response so the
// admin UI can show it in a copy-once modal.
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    email?:            string;
    full_name?:        string;
    phone?:            string;   // stored as WhatsApp too
    tags?:             string[];
    notes?:            string;
    lifecycle_stage?:  string;
    send_welcome_email?: boolean;
  };

  const email = str(body.email).toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const fullName = str(body.full_name) || null;
  const phone    = normalisePhone(body.phone ?? null);
  const tags     = Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : [];
  const notes    = str(body.notes) || null;
  const lifecycleStage = str(body.lifecycle_stage) || "customer";
  const sendEmail = body.send_welcome_email !== false;

  // Duplicate check — Supabase returns a specific error on createUser if the
  // email already exists, but a pre-check gives a cleaner message and lets
  // us short-circuit before any writes.
  const { data: { users: existingUsers } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
  const dup = (existingUsers as { email?: string }[]).find(u => (u.email ?? "").toLowerCase() === email);
  if (dup) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const tempPassword = generateTempPassword(14);

  const { data: created, error: createErr } = await ctx.adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,       // admin-created accounts skip email verification
    user_metadata: {
      full_name: fullName,
      phone,
      must_change_password: true,
      created_by_admin: ctx.user.id,
    },
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? "Failed to create user" }, { status: 400 });
  }
  const newUserId = created.user.id;

  // CRM contact upsert. If a row exists on this email we link it (set
  // user_id, backfill fields) and UNION the tags — never overwrite the
  // admin's or another flow's existing tag list. Otherwise create fresh.
  const { data: existingContact } = await ctx.adminClient
    .from("crm_contacts").select("id, tags").eq("email", email).maybeSingle();

  let contactId: string | null = null;
  if (existingContact?.id) {
    contactId = existingContact.id as string;
    const existingTags = Array.isArray(existingContact.tags) ? existingContact.tags as string[] : [];
    const mergedTags = Array.from(new Set([...existingTags, ...tags]));
    await ctx.adminClient.from("crm_contacts").update({
      user_id:         newUserId,
      display_name:    fullName ?? undefined,
      whatsapp_number: phone ?? undefined,
      lifecycle_stage: lifecycleStage,
      tags:            mergedTags,
      notes:           notes ?? undefined,
      updated_at:      new Date().toISOString(),
    }).eq("id", contactId);
  } else {
    const { data: newContact } = await ctx.adminClient.from("crm_contacts").insert({
      user_id:         newUserId,
      email,
      display_name:    fullName,
      whatsapp_number: phone,
      phone,
      lifecycle_stage: lifecycleStage,
      tags,
      notes,
      status:          "active",
    }).select("id").single();
    contactId = (newContact?.id as string) ?? null;
  }

  // Send the welcome email out-of-band from the response. Failures here
  // don't unwind the account creation — the admin can retry from the reset
  // button if delivery fails.
  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailError: string | null = null;
  if (sendEmail) {
    try {
      await sendWelcomeAccountEmail({
        userEmail:    email,
        userName:     fullName,
        tempPassword,
      });
      emailStatus = "sent";
    } catch (e: unknown) {
      emailStatus = "failed";
      emailError = e instanceof Error ? e.message : "Email delivery failed";
      console.error("[admin/users create] welcome email failed:", e);
    }
  }

  return NextResponse.json({
    user: {
      id: newUserId,
      email,
      name: fullName,
      created_at: created.user.created_at,
    },
    contact_id:   contactId,
    temp_password: tempPassword,   // shown once in the admin UI
    email_status: emailStatus,
    email_error:  emailError,
  });
}
