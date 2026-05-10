import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import leadsDb from "@/lib/postgres/leads-db";
import type { DiscoverCompanySearchResponse, DiscoverCompanyResult } from "@/types/discover";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

function csv(val: string | null | undefined, fallback: string[] = []): string[] {
  const v = (val || "").trim();
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const p = new URL(req.url).searchParams;

  const keyword        = p.get("q")?.trim() || null;
  const industries     = csv(p.get("industry"));
  const companySizes   = csv(p.get("company_size"));
  const countries      = csv(p.get("country"));
  const city           = p.get("city")?.trim() || null;
  const fundingStages  = csv(p.get("funding_stage"));
  const employeeMin    = parseInt(p.get("employee_min") || "0") || 0;
  const employeeMax    = parseInt(p.get("employee_max") || "0") || 0;
  const revenueMin     = parseInt(p.get("revenue_min") || "0") || 0;
  const revenueMax     = parseInt(p.get("revenue_max") || "0") || 0;
  const hasPeople      = p.get("has_people") === "true";
  const page           = Math.max(1, parseInt(p.get("page") || "1"));
  const limit          = Math.min(MAX_LIMIT, Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT))));
  const offset         = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: unknown[]    = [];
    let   i = 1;

    function addOr(field: string, values: string[], substring = false) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `${field} ILIKE $${i + j}`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values.map(v => substring ? `%${v}%` : v));
      i += values.length;
    }

    if (keyword) {
      conditions.push(`(c.name ILIKE $${i} OR c.domain ILIKE $${i})`);
      params.push(`%${keyword}%`); i++;
    }
    addOr("c.industry",      industries,   true);
    addOr("c.size_range",    companySizes, false);
    addOr("c.country",       countries,    false);
    addOr("c.funding_stage", fundingStages, false);
    if (city) { conditions.push(`c.city ILIKE $${i}`); params.push(`%${city}%`); i++; }
    if (employeeMin > 0) { conditions.push(`c.employee_count >= $${i}`); params.push(employeeMin); i++; }
    if (employeeMax > 0) { conditions.push(`c.employee_count <= $${i}`); params.push(employeeMax); i++; }
    if (revenueMin  > 0) { conditions.push(`c.revenue_usd >= $${i}`);   params.push(revenueMin);  i++; }
    if (revenueMax  > 0) { conditions.push(`c.revenue_usd <= $${i}`);   params.push(revenueMax);  i++; }
    if (hasPeople) {
      conditions.push(
        `EXISTS (SELECT 1 FROM discover_people p WHERE p.company_id = c.source_id OR p.company_id = c.id::text)`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows, rows] = await Promise.all([
      leadsDb.unsafe(`
        SELECT COUNT(*) AS total FROM discover_companies c ${where}
      `, params as never[]),
      leadsDb.unsafe(`
        SELECT
          c.id, c.name, c.domain, c.website_url, c.linkedin_url,
          c.industry, c.size_range, c.employee_count, c.revenue_usd,
          c.funding_stage, c.funding_total,
          c.country, c.state, c.city,
          COUNT(p.id)::int AS people_count
        FROM discover_companies c
        LEFT JOIN discover_people p ON p.company_id = c.source_id OR p.company_id = c.id::text
        ${where}
        GROUP BY c.id
        ORDER BY people_count DESC, c.name ASC
        LIMIT $${i} OFFSET $${i + 1}
      `, [...params, limit, offset] as never[]),
    ]);

    const total = parseInt((countRows[0] as unknown as { total: string }).total, 10);

    const results: DiscoverCompanyResult[] = (rows as Record<string, unknown>[]).map(r => ({
      id:            r.id            as string,
      name:          r.name          as string,
      domain:        r.domain        as string | null,
      website_url:   r.website_url   as string | null,
      linkedin_url:  r.linkedin_url  as string | null,
      industry:      r.industry      as string | null,
      size_range:    r.size_range    as string | null,
      employee_count: r.employee_count as number | null,
      revenue_usd:   r.revenue_usd   as number | null,
      funding_stage: r.funding_stage as string | null,
      funding_total: r.funding_total as number | null,
      country:       r.country       as string | null,
      state:         r.state         as string | null,
      city:          r.city          as string | null,
      people_count:  (r.people_count as number) || 0,
    }));

    return NextResponse.json({ results, total, page, limit } satisfies DiscoverCompanySearchResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discover/companies/search]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
