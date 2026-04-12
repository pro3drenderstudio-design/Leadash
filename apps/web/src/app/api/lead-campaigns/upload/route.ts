import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { CREDIT_COSTS } from "@/types/lead-campaigns";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const formData = await req.formData();
  const name                 = formData.get("name") as string | null;
  const mode                 = (formData.get("mode") as string) || "verify_personalize";
  const max_leads            = parseInt(formData.get("max_leads") as string) || 100;
  const verify_enabled       = formData.get("verify_enabled") !== "false";
  const personalize_enabled  = formData.get("personalize_enabled") === "true";
  const personalize_prompt   = (formData.get("personalize_prompt") as string) || null;
  const personalize_valid_only = formData.get("personalize_valid_only") === "true";
  const personalize_depth    = (formData.get("personalize_depth") as string) || "standard";
  const file                 = formData.get("file") as File | null;

  if (!name || !file) {
    return NextResponse.json({ error: "name and file are required" }, { status: 400 });
  }

  // Check credit balance — compute dynamically based on which operations are enabled
  const costPerLead =
    (mode === "scrape" || mode === "full_suite" ? CREDIT_COSTS.scrape : 0) +
    (mode === "verify_personalize" || mode === "full_suite" ? CREDIT_COSTS.verify : 0) +
    ((mode === "verify_personalize" || mode === "full_suite") && personalize_enabled
      ? CREDIT_COSTS.ai_personalize
      : 0);
  const creditsNeeded  = max_leads * costPerLead;

  const { data: workspace } = await db
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();

  if (!workspace || workspace.lead_credits_balance < creditsNeeded) {
    return NextResponse.json(
      { error: `Insufficient credits. Need ${creditsNeeded}, have ${workspace?.lead_credits_balance ?? 0}.` },
      { status: 402 },
    );
  }

  // Parse CSV
  const text    = await file.text();
  const lines   = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
  }

  // Parse header — handle quoted headers
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());

  const parseRow = (line: string): string[] => {
    const vals: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };

  const rows = lines.slice(1)
    .slice(0, max_leads)
    .map(line => {
      const vals = parseRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? "").replace(/^["']|["']$/g, ""); });
      return row;
    })
    .filter(r => r.email?.includes("@"));

  if (!rows.length) {
    return NextResponse.json({ error: "No rows with a valid email found in CSV" }, { status: 400 });
  }

  // Create campaign
  const { data: campaign, error } = await db
    .from("lead_campaigns")
    .insert({
      workspace_id:          workspaceId,
      name,
      mode,
      max_leads,
      verify_enabled,
      personalize_enabled,
      personalize_prompt:      personalize_prompt || null,
      personalize_valid_only,
      personalize_depth,
      credits_reserved:        creditsNeeded,
      status:                  "running",
      started_at:              new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert leads
  const leads = rows.map(r => ({
    workspace_id:        workspaceId,
    campaign_id:         campaign.id,
    email:               r.email,
    first_name:          r.first_name || r.firstname || r["first name"] || null,
    last_name:           r.last_name  || r.lastname  || r["last name"]  || null,
    company:             r.company    || r.organization || null,
    title:               r.title      || r.job_title || r["job title"]  || null,
    website:             r.website    || r.domain || null,
    phone:               r.phone      || null,
    linkedin_url:        r.linkedin_url || r.linkedin || null,
    verification_status: verify_enabled ? "pending" : null,
  }));

  const BATCH = 100;
  for (let i = 0; i < leads.length; i += BATCH) {
    await db.from("lead_campaign_leads").insert(leads.slice(i, i + BATCH));
  }

  await db.from("lead_campaigns")
    .update({ total_scraped: leads.length })
    .eq("id", campaign.id);

  return NextResponse.json(campaign, { status: 201 });
}
