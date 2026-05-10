import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import leadsDb from "@/lib/postgres/leads-db";

export type LocationResult = {
  value: string;
  type: "country" | "state" | "city";
};

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });

  const pattern = `%${q}%`;

  try {
    const rows = await leadsDb.unsafe<{ value: string; type: string; cnt: number }[]>(`
      SELECT value, type, cnt FROM (
        SELECT country AS value, 'country' AS type, COUNT(*) AS cnt
        FROM discover_companies
        WHERE country ILIKE $1 AND country IS NOT NULL AND country <> ''
        GROUP BY country
        ORDER BY cnt DESC LIMIT 6
      ) countries
      UNION ALL
      SELECT value, type, cnt FROM (
        SELECT state AS value, 'state' AS type, COUNT(*) AS cnt
        FROM discover_companies
        WHERE state ILIKE $1 AND state IS NOT NULL AND state <> ''
        GROUP BY state
        ORDER BY cnt DESC LIMIT 6
      ) states
      UNION ALL
      SELECT value, type, cnt FROM (
        SELECT city AS value, 'city' AS type, COUNT(*) AS cnt
        FROM discover_companies
        WHERE city ILIKE $1 AND city IS NOT NULL AND city <> ''
        GROUP BY city
        ORDER BY cnt DESC LIMIT 8
      ) cities
      ORDER BY cnt DESC
    `, [pattern] as never[]);

    const results: LocationResult[] = rows.map(r => ({
      value: r.value,
      type: r.type as LocationResult["type"],
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
