import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendBetaApplicationConfirmation, sendBetaAdminNotification } from "@/lib/email/notifications";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Check for existing enrollment
  const { data: existing } = await db
    .from("beta_enrollments")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Already enrolled", status: existing.status }, { status: 409 });
  }

  // Get workspace
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

  const { name, email: formEmail, reason } = await req.json() as { name?: string; email?: string; reason?: string };

  // Use the email from the form if provided (could differ from auth email), otherwise fall back to auth email
  const contactEmail = formEmail?.trim() || user.email || "";

  const { error } = await db.from("beta_enrollments").insert({
    user_id:      user.id,
    workspace_id: member.workspace_id,
    email:        contactEmail,
    name:         name ?? null,
    reason:       reason ?? null,
    status:       "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fire-and-forget notifications — don't block the response
  const adminEmail = process.env.NOTIFY_ADMIN_EMAIL ?? process.env.NOTIFY_FROM_EMAIL;
  Promise.all([
    sendBetaApplicationConfirmation({ userEmail: contactEmail, userName: name ?? null }).catch(() => {}),
    adminEmail
      ? sendBetaAdminNotification({ adminEmail, userName: name ?? null, userEmail: user.email ?? "", reason: reason ?? null, enrollmentId: "" }).catch(() => {})
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ enrollment: null });

  const db = createAdminClient();
  const { data } = await db
    .from("beta_enrollments")
    .select("id, status, created_at, review_note")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ enrollment: data ?? null });
}
