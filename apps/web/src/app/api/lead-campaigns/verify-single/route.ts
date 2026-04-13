import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyEmails } from "@/lib/lead-campaigns/reoon";

// POST /api/lead-campaigns/verify-single
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { email } = await req.json() as { email?: string };
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });

  const apiKey = process.env.REOON_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "REOON_API_KEY is not configured" }, { status: 500 });

  const [result] = await verifyEmails(apiKey, [email.trim().toLowerCase()]);
  return NextResponse.json(result);
}
