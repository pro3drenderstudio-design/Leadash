import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

interface CsvRow {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  website?: string;
  [key: string]: string | undefined;
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { list_id, rows } = await req.json() as { list_id: string; rows: CsvRow[] };
  if (!list_id || !rows?.length) return NextResponse.json({ error: "list_id and rows required" }, { status: 400 });

  // Get unsubscribe + blacklist
  const [unsubRes, blacklistRes] = await Promise.all([
    db.from("outreach_unsubscribes").select("email").eq("workspace_id", workspaceId),
    db.from("outreach_blacklist_domains").select("domain").eq("workspace_id", workspaceId),
  ]);
  const unsubEmails   = new Set((unsubRes.data ?? []).map(u => u.email.toLowerCase()));
  const blacklisted   = new Set((blacklistRes.data ?? []).map(b => b.domain.toLowerCase()));

  const result = { imported: 0, skipped_unsubscribed: 0, skipped_duplicate: 0, errors: [] as string[] };
  const toInsert: Record<string, unknown>[] = [];

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.errors.push(`Invalid email: ${row.email}`);
      continue;
    }
    if (unsubEmails.has(email)) { result.skipped_unsubscribed++; continue; }
    const domain = email.split("@")[1];
    if (blacklisted.has(domain)) { result.skipped_unsubscribed++; continue; }

    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!["email","first_name","last_name","company","title","website"].includes(k) && v) {
        custom[k] = v;
      }
    }

    toInsert.push({
      workspace_id:  workspaceId,
      list_id,
      email,
      first_name:    row.first_name ?? null,
      last_name:     row.last_name ?? null,
      company:       row.company ?? null,
      title:         row.title ?? null,
      website:       row.website ?? null,
      custom_fields: Object.keys(custom).length ? custom : null,
    });
  }

  if (toInsert.length) {
    const { data, error } = await db
      .from("outreach_leads")
      .upsert(toInsert, { onConflict: "workspace_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result.imported = data?.length ?? 0;
    result.skipped_duplicate = toInsert.length - result.imported;
  }

  return NextResponse.json(result);
}
