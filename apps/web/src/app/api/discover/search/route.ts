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

  const keyword      = p.get("q")?.trim() || null;
  const titleKws     = csv(p.get("title"));
  const seniorities  = csv(p.get("seniority"));
  const departments  = csv(p.get("department"));
  const countries    = csv(p.get("country"));
  const city         = p.get("city")?.trim() || null;
  const companies    = csv(p.get("company"));
  const industries   = csv(p.get("industry"));
  const companySizes = csv(p.get("company_size"));
  const emailStatus  = p.get("email_status") || "has_email";
  const page         = Math.max(1, parseInt(p.get("page") || "1"));
  const limit        = Math.min(MAX_LIMIT, Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT))));
  const offset       = (page - 1) * limit;

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
      conditions.push(`(p.first_name ILIKE $${i} OR p.last_name ILIKE $${i} OR p.title ILIKE $${i} OR p.company_name ILIKE $${i})`);
      params.push(`%${keyword}%`); i++;
    }
    addOr("p.title",      titleKws,     true);
    addOr("p.seniority",  seniorities,  false);
    addOr("p.department", departments,  true);
    addOr("p.country",    countries,    false);
    if (city) { conditions.push(`p.city ILIKE $${i}`); params.push(`%${city}%`); i++; }
    addOr("p.company_name", companies,  true);
    addOr("c.industry",   industries,   true);
    addOr("c.size_range", companySizes, false);

    if (emailStatus === "has_email") {
      conditions.push(`p.email IS NOT NULL AND p.email <> ''`);
    } else if (emailStatus === "verified") {
      conditions.push(`p.email IS NOT NULL AND p.email <> '' AND p.email_status = 'verified'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows, rows] = await Promise.all([
      leadsDb.unsafe(`
        SELECT COUNT(*) AS total
        FROM discover_people p
        LEFT JOIN discover_companies c ON c.source_id = p.company_id OR (c.source_id IS NULL AND c.id::text = p.company_id)
        ${where}
      `, params as never[]),
      leadsDb.unsafe(`
        SELECT
          p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
          p.linkedin_url, p.email, p.email_status, p.phone,
          p.country, p.state, p.city, p.company_name, p.company_id,
          c.domain AS company_domain,
          c.industry AS company_industry, c.size_range AS company_size
        FROM discover_people p
        LEFT JOIN discover_companies c ON c.source_id = p.company_id OR (c.source_id IS NULL AND c.id::text = p.company_id)
        ${where}
        ORDER BY p.created_at DESC
        LIMIT $${i} OFFSET $${i + 1}
      `, [...params, limit, offset] as never[]),
    ]);

    const total = parseInt((countRows[0] as unknown as { total: string }).total, 10);
    const personIds = (rows as Record<string, unknown>[]).map(r => r.id as string);

    // Fetch reveals for visible IDs
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
    } satisfies DiscoverSearchResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discover/search]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
