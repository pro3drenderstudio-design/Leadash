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

  const keyword          = p.get("q")?.trim() || null;
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes     = csv(p.get("company_size"));
  const locationIncludes = csv(p.get("location_include"));
  const locationExcludes = csv(p.get("location_exclude"));
  const fundingStages    = csv(p.get("funding_stage"));
  const keywordIncludes  = csv(p.get("keyword_include"));
  const keywordExcludes  = csv(p.get("keyword_exclude"));
  const employeeMin      = parseInt(p.get("employee_min") || "0") || 0;
  const employeeMax      = parseInt(p.get("employee_max") || "0") || 0;
  const revenueMin       = parseInt(p.get("revenue_min") || "0") || 0;
  const revenueMax       = parseInt(p.get("revenue_max") || "0") || 0;
  const hasPeople        = p.get("has_people") === "true";
  const page             = Math.max(1, parseInt(p.get("page") || "1"));
  const limit            = Math.min(MAX_LIMIT, Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT))));
  const offset           = (page - 1) * limit;

  const CO_SORT_COLS: Record<string, string> = {
    name:         "c.name",
    industry:     "c.industry",
    size:         "c.employee_count",
    location:     "c.country",
    people_count: "people_count",
    revenue:      "c.revenue_usd",
  };
  const sortRaw = p.get("sort") || "people_count";
  const sortCol = CO_SORT_COLS[sortRaw] ?? "people_count";
  const sortDir = p.get("order") === "asc" ? "ASC" : "DESC";

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

    function addNone(field: string, values: string[], substring = false) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `${field} ILIKE $${i + j}`).join(" OR ");
      conditions.push(`NOT (${clauses})`);
      params.push(...values.map(v => substring ? `%${v}%` : v));
      i += values.length;
    }

    function addLocationOr(values: string[]) {
      if (!values.length) return;
      const perVal = values.map((_, j) =>
        `(c.country ILIKE $${i + j} OR c.state ILIKE $${i + j} OR c.city ILIKE $${i + j})`
      );
      conditions.push(`(${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    function addLocationNone(values: string[]) {
      if (!values.length) return;
      const perVal = values.map((_, j) =>
        `(c.country ILIKE $${i + j} OR c.state ILIKE $${i + j} OR c.city ILIKE $${i + j})`
      );
      conditions.push(`NOT (${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    if (keyword) {
      conditions.push(`(c.name ILIKE $${i} OR c.domain ILIKE $${i} OR c.description ILIKE $${i} OR c.keywords ILIKE $${i})`);
      params.push(`%${keyword}%`); i++;
    }
    addOr("c.keywords",   keywordIncludes, true);
    addNone("c.keywords", keywordExcludes, true);
    addOr("c.industry",      industryIncludes, true);
    addNone("c.industry",    industryExcludes, true);
    addOr("c.size_range",    companySizes,     false);
    addLocationOr(locationIncludes);
    addLocationNone(locationExcludes);
    addOr("c.funding_stage", fundingStages,    true);
    if (employeeMin > 0) { conditions.push(`c.employee_count >= $${i}`); params.push(employeeMin); i++; }
    if (employeeMax > 0) { conditions.push(`c.employee_count <= $${i}`); params.push(employeeMax); i++; }
    if (revenueMin  > 0) { conditions.push(`c.revenue_usd >= $${i}`);   params.push(revenueMin);  i++; }
    if (revenueMax  > 0) { conditions.push(`c.revenue_usd <= $${i}`);   params.push(revenueMax);  i++; }
    if (hasPeople) {
      conditions.push(`EXISTS (SELECT 1 FROM discover_people p WHERE p.company_id = c.id)`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Check which optional columns exist (keywords was added via backfill; description was always there)
    const colCheck = await leadsDb.unsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' AND column_name IN ('keywords','description')`,
      [] as never[]
    );
    const existingCols = new Set(colCheck.map(r => r.column_name));
    const descSql  = existingCols.has("description") ? "c.description," : "NULL::text AS description,";
    const kwSql    = existingCols.has("keywords")    ? "c.keywords,"    : "NULL::text AS keywords,";

    // keyword filter on c.keywords only applies when column exists
    if (!existingCols.has("keywords") && conditions.some(c => c.includes("c.keywords"))) {
      return NextResponse.json({ results: [], total: 0, page, limit }, { status: 200 });
    }

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
          ${descSql}
          ${kwSql}
          COUNT(p.id)::int AS people_count
        FROM discover_companies c
        LEFT JOIN discover_people p ON p.company_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY ${sortCol} ${sortDir} NULLS LAST, c.name ASC
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
      description:   r.description   as string | null,
      keywords:      r.keywords      as string | null,
      people_count:  (r.people_count as number) || 0,
    }));

    return NextResponse.json({ results, total, page, limit } satisfies DiscoverCompanySearchResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discover/companies/search]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
