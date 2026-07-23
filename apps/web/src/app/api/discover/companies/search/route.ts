import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import leadsDb from "@/lib/postgres/leads-db";
import { isOpenSearchConfigured } from "@/lib/postgres/leads-os";
import { osCompanySearch, osCompanyIds } from "@/lib/discover/opensearch-companies";
import { getDiscoverMaintenance } from "@/lib/discover-cache";
import type { DiscoverCompanySearchResponse, DiscoverCompanyResult } from "@/types/discover";

export const maxDuration = 60;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;
const IDS_ONLY_MAX  = 50_000;

// Cached once per server process — these columns never change at runtime
let _colCache: Set<string> | null = null;
async function getExistingCols(): Promise<Set<string>> {
  if (_colCache) return _colCache;
  const rows = await leadsDb.unsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' AND column_name IN ('keywords','description')`,
    [] as never[]
  );
  _colCache = new Set(rows.map(r => r.column_name));
  return _colCache;
}

function csv(val: string | null | undefined, fallback: string[] = []): string[] {
  const v = (val || "").trim();
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const maintenance = await getDiscoverMaintenance();
  if (maintenance) {
    return NextResponse.json({ maintenance: true, message: maintenance }, { status: 503 });
  }

  const p = new URL(req.url).searchParams;

  const keyword          = p.get("q")?.trim() || null;
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes     = csv(p.get("company_size"));
  const countryIncludes  = csv(p.get("country_include"));
  const countryExcludes  = csv(p.get("country_exclude"));
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
  const idsOnly          = p.get("ids_only")    === "true";
  const skipCount        = p.get("skip_count") === "true";
  const page             = Math.max(1, parseInt(p.get("page") || "1"));
  const requestedLimit   = Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT)));
  const limit            = idsOnly
    ? Math.min(requestedLimit, IDS_ONLY_MAX)
    : Math.min(requestedLimit, MAX_LIMIT);
  const offset           = (page - 1) * limit;

  const CO_SORT_COLS: Record<string, string> = {
    name:         "c.name",
    industry:     "c.industry",
    size:         "c.employee_count",
    location:     "c.country",
    people_count: "c.people_count",
    revenue:      "c.revenue_usd",
  };
  const sortRaw = p.get("sort") || "name";
  const sortCol = CO_SORT_COLS[sortRaw] ?? "people_count";
  const sortDir = p.get("order") === "asc" ? "ASC" : "DESC";

  // ── OpenSearch fast path ──────────────────────────────────────────────
  // The companies index is fully populated; serve search + bulk-id selection
  // from OpenSearch (fast cold queries, exact counts, no people-table join).
  // Falls through to Postgres on any error.
  if (isOpenSearchConfigured()) {
    try {
      if (idsOnly) {
        const ids = await osCompanyIds(p, limit);
        return NextResponse.json({ ids });
      }
      const { total, rows } = await osCompanySearch(
        p, { from: offset, size: limit, sort: sortRaw, order: sortDir === "ASC" ? "asc" : "desc" },
      );
      const results: DiscoverCompanyResult[] = rows.map(r => ({
        id:             r.id,
        name:           r.name,
        domain:         r.domain,
        website_url:    r.website_url,
        linkedin_url:   r.linkedin_url,
        industry:       r.industry,
        size_range:     r.size_range,
        employee_count: r.employee_count,
        revenue_usd:    r.revenue_usd,
        funding_stage:  r.funding_stage,
        funding_total:  r.funding_total,
        country:        r.country,
        state:          r.state,
        city:           r.city,
        description:    r.description,
        keywords:       r.keywords,
        people_count:   r.people_count,
      }));
      return NextResponse.json({ results, total, page, limit } satisfies DiscoverCompanySearchResponse);
    } catch (e) {
      console.error("[discover/companies/search] OpenSearch path failed, falling back to Postgres:", e instanceof Error ? e.message : e);
    }
  }

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

    function addOrLower(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values);
      i += values.length;
    }

    function addNoneLower(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`NOT (${clauses})`);
      params.push(...values);
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
    addOrLower("c.country",   countryIncludes);
    addNoneLower("c.country", countryExcludes);
    addLocationOr(locationIncludes);
    addLocationNone(locationExcludes);
    addOr("c.funding_stage", fundingStages,    true);
    if (employeeMin > 0) { conditions.push(`c.employee_count >= $${i}`); params.push(employeeMin); i++; }
    if (employeeMax > 0) { conditions.push(`c.employee_count <= $${i}`); params.push(employeeMax); i++; }
    if (revenueMin  > 0) { conditions.push(`c.revenue_usd >= $${i}`);   params.push(revenueMin);  i++; }
    if (revenueMax  > 0) { conditions.push(`c.revenue_usd <= $${i}`);   params.push(revenueMax);  i++; }
    if (hasPeople) {
      // Precomputed count — avoids a subquery into the 192M-row people table.
      conditions.push(`c.people_count > 0`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    if (idsOnly) {
      const idRows = await leadsDb.unsafe<{ id: string }[]>(`
        SELECT c.id FROM discover_companies c ${where}
        ORDER BY c.name ASC NULLS LAST
        LIMIT $${i}
      `, [...params, limit] as never[]);
      return NextResponse.json({ ids: idRows.map(r => r.id) });
    }

    const existingCols = await getExistingCols();
    const descSql  = existingCols.has("description") ? "c.description," : "NULL::text AS description,";
    const kwSql    = existingCols.has("keywords")    ? "c.keywords,"    : "NULL::text AS keywords,";

    if (!existingCols.has("keywords") && conditions.some(c => c.includes("c.keywords"))) {
      return NextResponse.json({ results: [], total: 0, page, limit }, { status: 200 });
    }

    const HARD_CAP = 50_000;
    const countPromise = skipCount
      ? Promise.resolve(null)
      : leadsDb.unsafe(`
          SELECT count(*) AS total
          FROM (
            SELECT 1 FROM discover_companies c ${where}
            LIMIT 100001
          ) cnt
        `, params as never[])
          .catch(() => null);

    const countWithTimeout = () => Promise.race([
      countPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
    ]);

    const [countRows, rows] = await Promise.all([
      skipCount ? Promise.resolve(null) : countWithTimeout(),
      // people_count is a precomputed column on discover_companies now — no join
      // to the 192M-row people table, so sorting by contacts is index-fast.
      leadsDb.unsafe(`
        SELECT
          c.id, c.name, c.domain, c.website_url, c.linkedin_url,
          c.industry, c.size_range, c.employee_count, c.revenue_usd,
          c.funding_stage, c.funding_total,
          c.country, c.state, c.city,
          ${descSql}
          ${kwSql}
          c.people_count
        FROM discover_companies c
        ${where}
        ORDER BY ${sortCol} ${sortDir} NULLS LAST, c.name ASC
        LIMIT $${i} OFFSET $${i + 1}
      `, [...params, limit, offset] as never[]),
    ]);

    const total = skipCount ? -1 : (countRows ? parseInt((countRows[0] as unknown as { total: string }).total, 10) : HARD_CAP);

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
