/**
 * POST /api/admin/billing/link-subscriptions
 *
 * Backfill paystack_sub_code for paid workspaces that have a
 * paystack_customer_code but no subscription code stored.
 *
 * Fetches all subscriptions from Paystack (paginated), builds a
 * customer_code → subscription_code map, then updates matching workspaces.
 * Uses the full list because Paystack's ?customer= filter is unreliable.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const PAYSTACK_BASE = "https://api.paystack.co";

async function fetchAllSubscriptions(): Promise<Array<{ subscription_code: string; status: string; customer: { customer_code: string } }>> {
  const all: Array<{ subscription_code: string; status: string; customer: { customer_code: string } }> = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${PAYSTACK_BASE}/subscription?perPage=100&page=${page}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY!}` },
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json() as { status: boolean; data: typeof all; meta: { total: number; page: number; pageCount: number } };
    if (!json.status || !json.data?.length) break;
    all.push(...json.data);
    if (page >= (json.meta?.pageCount ?? 1)) break;
    page++;
  }
  return all;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Workspaces that need a subscription code
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, name, paystack_customer_code")
    .is("paystack_sub_code", null)
    .not("paystack_customer_code", "is", null)
    .neq("plan_id", "free");

  if (!workspaces?.length) {
    return NextResponse.json({ ok: true, linked: 0, message: "No workspaces need linking" });
  }

  // Build map: customer_code → active (or most recent) subscription_code
  const allSubs = await fetchAllSubscriptions();
  const subMap: Record<string, string> = {};
  for (const s of allSubs) {
    const cc = s.customer?.customer_code;
    if (!cc) continue;
    if (!subMap[cc] || s.status === "active") {
      subMap[cc] = s.subscription_code;
    }
  }

  const results: Array<{ workspace: string; status: "linked" | "not_found"; sub_code?: string }> = [];

  for (const ws of workspaces) {
    const subCode = subMap[ws.paystack_customer_code!];
    if (!subCode) {
      results.push({ workspace: ws.name ?? ws.id, status: "not_found" });
      continue;
    }
    await db.from("workspaces").update({ paystack_sub_code: subCode }).eq("id", ws.id);
    results.push({ workspace: ws.name ?? ws.id, status: "linked", sub_code: subCode });
  }

  const linked = results.filter(r => r.status === "linked").length;
  return NextResponse.json({ ok: true, linked, results });
}
