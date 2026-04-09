import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const { data, error } = await db.from("outreach_sequences").insert({
    workspace_id:       workspaceId,
    campaign_id:        body.campaign_id,
    step_order:         body.step_order,
    type:               body.type ?? "email",
    wait_days:          body.wait_days ?? 0,
    subject_template:   body.subject_template ?? null,
    subject_template_b: body.subject_template_b ?? null,
    body_template:      body.body_template ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
