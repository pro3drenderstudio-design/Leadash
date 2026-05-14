import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import leadsDb from "@/lib/postgres/leads-db";
import type { DiscoverSearchResponse, DiscoverResult } from "@/types/discover";

const CREDITS_PER_LEAD = 0.5;
const DEFAULT_LIMIT    = 25;
const MAX_LIMIT        = 100;

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "•••";
}

function csv(val: string | null | undefined, fallback: string[] = []): string[] {
  const v = (val || "").trim();
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const p = new URL(req.url).searchParams;

  const keyword         = p.get("q")?.trim() || null;
  const titleIncludes   = csv(p.get("title_include"));
  const titleExcludes   = csv(p.get("title_exclude"));
  const seniorities     = csv(p.get("seniority"));
  const departments     = csv(p.get("department"));
  const countryIncludes  = csv(p.get("country_include"));
  const countryExcludes  = csv(p.get("country_exclude"));
  const locationIncludes = csv(p.get("location_include"));
  const locationExcludes = csv(p.get("location_exclude"));
  const companyIncludes = csv(p.get("company_include"));
  const companyExcludes = csv(p.get("company_exclude"));
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes           = csv(p.get("company_size"));
  const companyKeywordIncludes = csv(p.get("co_keyword_include"));
  const companyKeywordExcludes = csv(p.get("co_keyword_exclude"));
  const emailStatus            = p.get("email_status") || "any";
  const page            = Math.max(1, parseInt(p.get("page") || "1"));
  const limit           = Math.min(MAX_LIMIT, Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT))));
  const offset          = (page - 1) * limit;

  const SORT_COLS: Record<string, string> = {
    name:         "p.first_name, p.last_name",
    title:        "p.title",
    company_name: "p.company_name",
    location:     "p.country, p.city",
    email_status: "p.email_status",
    created_at:   "p.created_at",
  };
  const sortRaw  = p.get("sort") || "created_at";
  const sortCol  = SORT_COLS[sortRaw] ?? "p.created_at";
  const sortDir  = p.get("order") === "asc" ? "ASC" : "DESC";

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
        `(p.country ILIKE $${i + j} OR p.state ILIKE $${i + j} OR p.city ILIKE $${i + j})`
      );
      conditions.push(`(${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    function addLocationNone(values: string[]) {
      if (!values.length) return;
      const perVal = values.map((_, j) =>
        `(p.country ILIKE $${i + j} OR p.state ILIKE $${i + j} OR p.city ILIKE $${i + j})`
      );
      conditions.push(`NOT (${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    if (keyword) {
      conditions.push(`(p.first_name ILIKE $${i} OR p.last_name ILIKE $${i} OR p.title ILIKE $${i} OR p.company_name ILIKE $${i})`);
      params.push(`%${keyword}%`); i++;
    }
    addOr("p.title",      titleIncludes,   true);
    addNone("p.title",    titleExcludes,   true);
    addOr("p.seniority",  seniorities,     false);
    addOr("p.department", departments,     true);
    addOrLower("p.country",   countryIncludes);
    addNoneLower("p.country", countryExcludes);
    addLocationOr(locationIncludes);
    addLocationNone(locationExcludes);
    addOr("p.company_name",  companyIncludes,  true);
    addNone("p.company_name", companyExcludes, true);
    addOr("c.industry",      industryIncludes, true);
    addNone("c.industry",    industryExcludes, true);
    addOr("c.size_range", companySizes, false);
    addOr("c.keywords",  companyKeywordIncludes, true);
    addNone("c.keywords", companyKeywordExcludes, true);

    if (emailStatus === "has_email") {
      conditions.push(`p.email IS NOT NULL AND p.email <> ''`);
    } else if (emailStatus === "verified") {
      conditions.push(`p.email IS NOT NULL AND p.email <> '' AND p.email_status = 'verified'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows, rows] = await Promise.all([
      leadsDb.unsafe(`
        SELECT count(*) AS total
        FROM (
          SELECT 1 FROM discover_people p
          LEFT JOIN discover_companies c ON c.id = p.company_id
          ${where}
          LIMIT 100001
        ) cnt
      `, params as never[]),
      leadsDb.unsafe(`
        SELECT
          p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
          p.linkedin_url, p.email, p.email_status, p.phone,
          p.country, p.state, p.city, p.company_name, p.company_id,
          c.domain AS company_domain,
          c.industry AS company_industry, c.size_range AS company_size,
          c.keywords AS company_keywords
        FROM discover_people p
        LEFT JOIN discover_companies c ON c.id = p.company_id
        ${where}
        ORDER BY ${sortCol} ${sortDir} NULLS LAST
        LIMIT $${i} OFFSET $${i + 1}
      `, [...params, limit, offset] as never[]),
    ]);

    const rawTotal = parseInt((countRows[0] as unknown as { total: string }).total, 10);
    const HARD_CAP = 50_000;
    const capped   = rawTotal > HARD_CAP;
    const total    = capped ? HARD_CAP : rawTotal;
    const personIds = (rows as Record<string, unknown>[]).map(r => r.id as string);

    const adminDb = createAdminClient();
    const revealMap = new Map<string, { email: string | null; phone: string | null; email_status: string | null; exported: boolean }>();
    if (personIds.length > 0) {
      const { data: revealRows } = await adminDb
        .from("discover_reveals")
        .select("person_id, email, phone, email_status, exported_at")
        .eq("workspace_id", workspaceId)
        .in("person_id", personIds);

      for (const r of (revealRows ?? [])) {
        revealMap.set(r.person_id, {
          email:        r.email,
          phone:        r.phone,
          email_status: r.email_status,
          exported:     !!r.exported_at,
        });
      }
    }

    const results: DiscoverResult[] = (rows as Record<string, unknown>[]).map((r) => {
      const rev = revealMap.get(r.id as string);
      const revealed = !!rev;
      return {
        id:               r.id               as string,
        company_id:       r.company_id       as string | null,
        first_name:       r.first_name       as string | null,
        last_name:        r.last_name        as string | null,
        title:            r.title            as string | null,
        seniority:        r.seniority        as string | null,
        department:       r.department       as string | null,
        linkedin_url:     r.linkedin_url     as string | null,
        email_status:     ((revealed ? rev!.email_status : r.email_status) as DiscoverResult["email_status"]) ?? "unverified",
        country:          r.country          as string | null,
        state:            r.state            as string | null,
        city:             r.city             as string | null,
        company_name:     r.company_name     as string | null,
        company_domain:   r.company_domain   as string | null,
        company_industry: r.company_industry as string | null,
        company_size:     r.company_size     as string | null,
        company_keywords: r.company_keywords as string | null,
        email_preview:    revealed ? rev!.email : maskEmail(r.email as string | null),
        phone_preview:    revealed ? rev!.phone : maskPhone(r.phone as string | null),
        has_email:        !!(r.email),
        has_phone:        !!(r.phone),
        revealed,
        exported:         rev?.exported ?? false,
      };
    });

    return NextResponse.json({
      results, total, page, limit, credits_per_lead: CREDITS_PER_LEAD,
      ...(capped ? { message: "Too many results. Please refine your filters to see accurate counts." } : {}),
    } satisfies DiscoverSearchResponse);
  } catch (err) {
    console.error("[discover/search]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
