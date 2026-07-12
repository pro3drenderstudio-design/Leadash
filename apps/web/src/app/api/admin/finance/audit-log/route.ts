/**
 * GET /api/admin/finance/audit-log — recent finance audit trail entries
 * (reviews, flags, adjustments, period closes/reopens, syncs, backfills).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const { data, error } = await ctx.db
    .from("finance_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve actor emails for display
  const actorIds = Array.from(new Set<string>((data ?? []).map((r: { actor: string }) => String(r.actor))));
  const emails: Record<string, string> = {};
  for (const id of actorIds) {
    try {
      const { data: { user } } = await ctx.db.auth.admin.getUserById(id);
      if (user?.email) emails[id] = user.email;
    } catch { /* leave unresolved */ }
  }

  return NextResponse.json({
    entries: (data ?? []).map((r: Record<string, unknown>) => ({ ...r, actor_email: emails[r.actor as string] ?? null })),
  });
}
