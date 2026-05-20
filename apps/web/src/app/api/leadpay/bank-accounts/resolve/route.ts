import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const body = await req.json() as { account_number?: string; bank_code?: string };
  const accountNumber = body.account_number?.trim();
  const bankCode      = body.bank_code?.trim();

  if (!accountNumber || accountNumber.length !== 10) {
    return NextResponse.json({ error: "account_number must be 10 digits" }, { status: 400 });
  }
  if (!bankCode) {
    return NextResponse.json({ error: "bank_code required" }, { status: 400 });
  }

  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackKey) {
    return NextResponse.json({ error: "Bank resolution not configured" }, { status: 503 });
  }

  const res = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: { Authorization: `Bearer ${paystackKey}` } }
  );

  const data = await res.json() as { status: boolean; message: string; data?: { account_name: string; account_number: string } };
  if (!res.ok || !data.status) {
    return NextResponse.json({ error: data.message ?? "Could not resolve account" }, { status: 422 });
  }

  return NextResponse.json({
    account_name:   data.data?.account_name ?? "",
    account_number: data.data?.account_number ?? accountNumber,
  });
}
