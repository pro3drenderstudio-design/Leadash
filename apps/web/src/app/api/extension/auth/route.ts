import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/extension-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.res;

  return NextResponse.json({ ok: true, workspace_id: auth.workspaceId });
}
