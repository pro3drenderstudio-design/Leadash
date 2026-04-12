import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// POST /api/outreach/crm/unmatched/[id]/promote
// Promotes an unmatched reply to a CRM inbox thread.
// Creates or reuses a lead for the sender, creates a stub enrollment,
// and links the reply so it shows up in the Inbox tab.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: replyId } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Fetch the unmatched reply
  const { data: reply, error: replyErr } = await db
    .from("outreach_replies")
    .select("*, inbox:outreach_inboxes(id, email_address, first_name, last_name)")
    .eq("id", replyId)
    .eq("workspace_id", workspaceId)
    .is("enrollment_id", null)
    .single();

  if (replyErr || !reply)
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });

  // Upsert lead for the sender's email
  const senderEmail = (reply.from_email as string).toLowerCase();
  const nameParts   = ((reply.from_name as string | null) ?? "").trim().split(/\s+/);
  const firstName   = nameParts[0] || null;
  const lastName    = nameParts.slice(1).join(" ") || null;

  let leadId: string;
  const { data: existingLead } = await db
    .from("outreach_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", senderEmail)
    .limit(1)
    .single();

  if (existingLead) {
    leadId = existingLead.id as string;
  } else {
    const { data: newLead, error: leadErr } = await db
      .from("outreach_leads")
      .insert({
        workspace_id: workspaceId,
        email:        senderEmail,
        first_name:   firstName,
        last_name:    lastName,
        list_id:      null,
        status:       "active",
      })
      .select("id")
      .single();
    if (leadErr || !newLead)
      return NextResponse.json({ error: leadErr?.message ?? "Failed to create lead" }, { status: 500 });
    leadId = newLead.id as string;
  }

  // Create stub enrollment (no campaign — direct inbound)
  const { data: enrollment, error: enrollErr } = await db
    .from("outreach_enrollments")
    .insert({
      workspace_id: workspaceId,
      lead_id:      leadId,
      campaign_id:  null,
      status:       "replied",
      crm_status:   reply.ai_category && reply.ai_category !== "neutral" ? reply.ai_category : "neutral",
      current_step: 0,
    })
    .select("id")
    .single();

  if (enrollErr || !enrollment)
    return NextResponse.json({ error: enrollErr?.message ?? "Failed to create thread" }, { status: 500 });

  const enrollmentId = enrollment.id as string;

  // Link reply to enrollment
  await db
    .from("outreach_replies")
    .update({ enrollment_id: enrollmentId })
    .eq("id", replyId)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true, enrollment_id: enrollmentId });
}
