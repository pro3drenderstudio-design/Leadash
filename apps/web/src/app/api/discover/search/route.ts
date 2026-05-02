import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import type { DiscoverSearchResponse, DiscoverResult } from "@/types/discover";

const CREDITS_PER_LEAD = 0.5;
const DEFAULT_LIMIT    = 25;
const MAX_LIMIT        = 100;

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const url     = new URL(req.url);
  const q            = url.searchParams.get("q")?.trim() || null;
  const country      = url.searchParams.get("country") || null;
  const seniority    = url.searchParams.get("seniority") || null;
  const industry     = url.searchParams.get("industry") || null;
  const company_size = url.searchParams.get("company_size") || null;
  const has_email    = url.searchParams.get("has_email") === "true" ? true : null;
  const page         = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit        = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT))));
  const offset       = (page - 1) * limit;

  // Use admin client for cross-workspace discover table reads
  const db = createAdminClient();

  let query = db
    .from("discover_people")
    .select(`
      id, first_name, last_name, title, seniority, department,
      linkedin_url, email, email_status, phone, country, state, city,
      discover_companies!company_id (
        id, name, domain, industry, size_range
      )
    `, { count: "exact" });

  // Keyword search across name, title, company name
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }
  if (country)      query = query.ilike("country", country);
  if (seniority)    query = query.ilike("seniority", seniority);
  if (has_email)    query = query.not("email", "is", null).neq("email", "");
  if (company_size) {
    query = query.eq("discover_companies.size_range" as never, company_size);
  }
  if (industry) {
    query = query.ilike("discover_companies.industry" as never, `%${industry}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: DiscoverResult[] = (data ?? []).map((p: Record<string, unknown>) => {
    const co = (p.discover_companies as Record<string, unknown> | null) ?? {};
    return {
      id:               p.id as string,
      company_id:       (co.id as string) ?? null,
      first_name:       (p.first_name as string) ?? null,
      last_name:        (p.last_name as string) ?? null,
      title:            (p.title as string) ?? null,
      seniority:        (p.seniority as string) ?? null,
      department:       (p.department as string) ?? null,
      linkedin_url:     (p.linkedin_url as string) ?? null,
      email_status:     (p.email_status as DiscoverResult["email_status"]) ?? "unverified",
      country:          (p.country as string) ?? null,
      state:            (p.state as string) ?? null,
      city:             (p.city as string) ?? null,
      company_name:     (co.name as string) ?? null,
      company_domain:   (co.domain as string) ?? null,
      company_industry: (co.industry as string) ?? null,
      company_size:     (co.size_range as string) ?? null,
      email_preview:    maskEmail(p.email as string | null),
      has_email:        !!(p.email),
      has_phone:        !!(p.phone),
    };
  });

  const response: DiscoverSearchResponse = {
    results,
    total:            count ?? 0,
    page,
    limit,
    credits_per_lead: CREDITS_PER_LEAD,
  };

  return NextResponse.json(response);
}
