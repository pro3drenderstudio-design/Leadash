import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/outreach/crm/lead-profile?lead_id=xxx
// Returns full lead details + all enrollment history for that lead
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const leadId = new URL(req.url).searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const [leadRes, enrollmentsRes] = await Promise.all([
    db.from("outreach_leads")
      .select("id, email, first_name, last_name, company, title, website, status, custom_fields, verification_status, created_at")
      .eq("id", leadId)
      .eq("workspace_id", workspaceId)
      .single(),

    db.from("outreach_enrollments")
      .select(`
        id, status, crm_status, enrolled_at, completed_at,
        campaign:outreach_campaigns!campaign_id(id, name, status)
      `)
      .eq("lead_id", leadId)
      .eq("workspace_id", workspaceId)
      .order("enrolled_at", { ascending: false })
      .limit(20),
  ]);

  if (leadRes.error || !leadRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead:        leadRes.data,
    enrollments: enrollmentsRes.data ?? [],
  });
}
