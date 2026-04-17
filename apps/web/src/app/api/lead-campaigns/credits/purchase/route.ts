import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { CREDIT_PACKS } from "@/lib/billing/plans";
import { createPaystackCheckout } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { pack_id, callback_url: customCallback } = await req.json() as { pack_id: string; callback_url?: string };
  const pack = CREDIT_PACKS.find(p => p.id === pack_id);
  if (!pack) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email")
    .eq("id", workspaceId)
    .single();

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const defaultCallback = `${origin}/lead-campaigns/credits?purchase=success&credits=${pack.credits}`;
  const callbackUrl = customCallback ?? defaultCallback;

  const { authorizationUrl } = await createPaystackCheckout({
    email:      workspace.billing_email ?? `ws-${workspaceId}@leadash.app`,
    amountKobo: pack.priceNgn * 100,
    callbackUrl,
    metadata: {
      workspace_id: workspaceId,
      pack_id:      pack.id,
      credits:      String(pack.credits),
      type:         "credit_purchase",
    },
  });

  return NextResponse.json({ url: authorizationUrl });
}
