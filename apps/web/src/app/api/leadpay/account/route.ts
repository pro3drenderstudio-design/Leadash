import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: account, error } = await db
    .from("leadpay_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Only one account per workspace
  const { data: existing } = await db
    .from("leadpay_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Account already exists" }, { status: 409 });

  const body = await req.json() as Record<string, unknown>;

  const accountType  = body.account_type as string | undefined;
  const firstName    = (body.legal_first_name as string | undefined)?.trim();
  const lastName     = (body.legal_last_name  as string | undefined)?.trim();
  const dob          = body.date_of_birth as string | undefined;
  const phone        = (body.phone as string | undefined)?.trim();
  const bvnOrNin     = (body.bvn_or_nin as string | undefined)?.trim();

  if (!firstName) return NextResponse.json({ error: "legal_first_name required" }, { status: 400 });
  if (!lastName)  return NextResponse.json({ error: "legal_last_name required" },  { status: 400 });
  if (!dob)       return NextResponse.json({ error: "date_of_birth required" },    { status: 400 });
  if (!phone)     return NextResponse.json({ error: "phone required" },             { status: 400 });
  if (!bvnOrNin)  return NextResponse.json({ error: "bvn_or_nin required" },       { status: 400 });

  const businessFields: Record<string, unknown> = {};
  if (accountType === "business") {
    businessFields.business_name = (body.business_name as string | undefined)?.trim() ?? null;
    businessFields.rc_number     = (body.rc_number     as string | undefined)?.trim() ?? null;
    businessFields.business_type = (body.business_type as string | undefined)?.trim() ?? null;
    businessFields.website       = (body.website       as string | undefined)?.trim() ?? null;
  }

  const { data: account, error } = await db
    .from("leadpay_accounts")
    .insert({
      workspace_id:     workspaceId,
      account_type:     accountType === "business" ? "business" : "individual",
      status:           "pending",
      kyc_status:       "pending",
      kyc_submitted_at: new Date().toISOString(),
      legal_first_name: firstName,
      legal_last_name:  lastName,
      date_of_birth:    dob,
      phone,
      // Store BVN/NIN in metadata — not exposed in public API
      ...businessFields,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add bank account if provided
  if (body.bank_account_number && body.bank_code && body.bank_name && body.account_name) {
    await db.from("leadpay_bank_accounts").insert({
      workspace_id:   workspaceId,
      account_number: body.bank_account_number,
      account_name:   body.account_name,
      bank_name:      body.bank_name,
      bank_code:      body.bank_code,
      is_default:     true,
    });
  }

  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["display_name","logo_url","brand_color","invoice_footer","invoice_note_template","phone","profession","website"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data: account, error } = await db
    .from("leadpay_accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account });
}
