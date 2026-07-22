import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// GET /api/admin/challenge-signups
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  const sp     = req.nextUrl.searchParams;
  const status = sp.get("status") || "pending";
  const search = sp.get("search")?.trim() || null;
  const from   = sp.get("from") || null; // YYYY-MM-DD (inclusive)
  const to     = sp.get("to")   || null; // YYYY-MM-DD (inclusive)
  const page   = Math.max(0, parseInt(sp.get("page") ?? "0") || 0);
  const PAGE   = 50;

  // Date bounds — upper is exclusive at (to + 1 day) so the whole `to` day counts.
  const fromIso = from ? `${from}T00:00:00Z` : null;
  let toExclusive: string | null = null;
  if (to) { const d = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); toExclusive = d.toISOString(); }

  // ── Main page of rows ──────────────────────────────────────────────────────
  let q = db
    .from("challenge_signups")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, (page + 1) * PAGE - 1);
  if (fromIso)     q = q.gte("created_at", fromIso);
  if (toExclusive) q = q.lt("created_at", toExclusive);
  if (status !== "all") q = q.eq("status", status);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Summary counts (respect the date range, ignore the status tab) ─────────
  const mkCount = (st?: string) => {
    let c = db.from("challenge_signups").select("id", { count: "exact", head: true });
    if (fromIso)     c = c.gte("created_at", fromIso);
    if (toExclusive) c = c.lt("created_at", toExclusive);
    if (st) c = c.eq("status", st);
    return c;
  };
  let revQ = db.from("challenge_signups").select("amount_ngn").eq("status", "confirmed");
  if (fromIso)     revQ = revQ.gte("created_at", fromIso);
  if (toExclusive) revQ = revQ.lt("created_at", toExclusive);

  const [totalR, pendingR, confirmedR, rejectedR, revRows] = await Promise.all([
    mkCount(), mkCount("pending"), mkCount("confirmed"), mkCount("rejected"), revQ,
  ]);
  const confirmedRevenueNgn = ((revRows.data ?? []) as { amount_ngn: number | null }[])
    .reduce((s, r) => s + (r.amount_ngn ?? 0), 0);

  return NextResponse.json({
    signups: data ?? [],
    total: count ?? 0,
    page,
    counts: {
      total:     totalR.count ?? 0,
      pending:   pendingR.count ?? 0,
      confirmed: confirmedR.count ?? 0,
      rejected:  rejectedR.count ?? 0,
      confirmed_revenue_ngn: confirmedRevenueNgn,
    },
  });
}
