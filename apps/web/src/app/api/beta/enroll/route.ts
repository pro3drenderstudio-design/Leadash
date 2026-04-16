import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendBetaApplicationConfirmation, sendBetaAdminNotification } from "@/lib/email/notifications";

export async function POST(req: NextRequest) {
  const db = createAdminClient();

  // Auth is optional — logged-in users get their workspace linked; others just store email
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { name, email: formEmail, reason } = await req.json() as { name?: string; email?: string; reason?: string };

  const contactEmail = formEmail?.trim().toLowerCase() || user?.email || "";
  if (!contactEmail) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Check for existing enrollment by email
  const { data: existing } = await db
    .from("beta_enrollments")
    .select("id, status")
    .eq("email", contactEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Already enrolled", status: existing.status }, { status: 409 });
  }

  // If logged in, also check by user_id
  if (user) {
    const { data: byUser } = await db
      .from("beta_enrollments")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (byUser) return NextResponse.json({ error: "Already enrolled", status: byUser.status }, { status: 409 });
  }

  // Get workspace if logged in
  let workspaceId: string | null = null;
  if (user) {
    const { data: member } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = member?.workspace_id ?? null;
  }

  const { error } = await db.from("beta_enrollments").insert({
    user_id:      user?.id      ?? null,
    workspace_id: workspaceId   ?? null,
    email:        contactEmail,
    name:         name.trim(),
    reason:       reason?.trim() ?? null,
    status:       "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fire-and-forget notifications
  const adminEmail = process.env.NOTIFY_ADMIN_EMAIL ?? process.env.NOTIFY_FROM_EMAIL;
  Promise.all([
    sendBetaApplicationConfirmation({ userEmail: contactEmail, userName: name }).catch(() => {}),
    adminEmail
      ? sendBetaAdminNotification({ adminEmail, userName: name, userEmail: contactEmail, reason: reason ?? null, enrollmentId: "" }).catch(() => {})
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ enrollment: null, email: null });

  const db = createAdminClient();

  // Find enrollment by user_id or by email
  const { data } = await db
    .from("beta_enrollments")
    .select("id, status, created_at, review_note")
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  return NextResponse.json({ enrollment: data ?? null, email: user.email ?? null });
}
