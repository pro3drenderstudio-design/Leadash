import { NextRequest, NextResponse } from "next/server";
import { runDeliverabilityChecks } from "@/lib/outreach/deliverability";

export const maxDuration = 60;

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDeliverabilityChecks();
  return NextResponse.json(result);
}
