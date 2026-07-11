import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import leadsDb from "@/lib/postgres/leads-db";

export const maxDuration = 60;

const MAX_PER_REQUEST = 5_000;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || !ids.length)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_PER_REQUEST)
    return NextResponse.json({ error: `Max ${MAX_PER_REQUEST} companies per export` }, { status: 400 });

  type CompanyRow = {
    name: string; domain: string | null; industry: string | null;
    size_range: string | null; employee_count: number | null;
    city: string | null; state: string | null; country: string | null;
    funding_stage: string | null; funding_total: number | null;
    website_url: string | null; linkedin_url: string | null;
    keywords: string | null;
  };

  const rows = await leadsDb.unsafe<CompanyRow[]>(`
    SELECT
      c.name, c.domain, c.industry, c.size_range, c.employee_count,
      c.city, c.state, c.country, c.funding_stage, c.funding_total,
      c.website_url, c.linkedin_url,
      c.keywords
    FROM discover_companies c
    WHERE c.id = ANY($1::uuid[])
    ORDER BY c.name ASC
  `, [ids] as never[]);

  const csvRows = rows.map(r =>
    [
      r.name, r.domain, r.industry, r.size_range,
      r.employee_count ?? "", r.city, r.state, r.country,
      r.funding_stage ?? "", r.funding_total ?? "",
      r.website_url ?? "", r.linkedin_url ?? "", r.keywords ?? "",
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  );

  const csv = [
    "Company,Domain,Industry,Size Range,Employees,City,State,Country,Funding Stage,Funding Total,Website,LinkedIn,Keywords",
    ...csvRows,
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv",
      "Content-Disposition": `attachment; filename="leadash-companies-${Date.now()}.csv"`,
    },
  });
}
