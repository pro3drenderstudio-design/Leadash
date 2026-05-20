import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: bankAccounts, error } = await db
    .from("leadpay_bank_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bank_accounts: bankAccounts ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const accountNumber = (body.account_number as string | undefined)?.trim();
  const accountName   = (body.account_name   as string | undefined)?.trim();
  const bankName      = (body.bank_name      as string | undefined)?.trim();
  const bankCode      = (body.bank_code      as string | undefined)?.trim();
  const isDefault     = Boolean(body.is_default);

  if (!accountNumber || accountNumber.length !== 10) {
    return NextResponse.json({ error: "account_number must be 10 digits" }, { status: 400 });
  }
  if (!accountName) return NextResponse.json({ error: "account_name required" }, { status: 400 });
  if (!bankName)    return NextResponse.json({ error: "bank_name required" },    { status: 400 });
  if (!bankCode)    return NextResponse.json({ error: "bank_code required" },    { status: 400 });

  // If setting as default, unset others
  if (isDefault) {
    await db
      .from("leadpay_bank_accounts")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId);
  }

  const { data: bankAccount, error } = await db
    .from("leadpay_bank_accounts")
    .insert({
      workspace_id:   workspaceId,
      account_number: accountNumber,
      account_name:   accountName,
      bank_name:      bankName,
      bank_code:      bankCode,
      is_default:     isDefault,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bank_account: bankAccount }, { status: 201 });
}
