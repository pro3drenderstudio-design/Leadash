import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import leadsDb from "@/lib/postgres/leads-db";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id } = await params;

  const url    = new URL(req.url);
  const page   = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "25")));
  const offset = (page - 1) * limit;

  try {
    type CompanyRow = {
      id: string; source_id: string | null; name: string; domain: string | null; website_url: string | null;
      linkedin_url: string | null; industry: string | null; size_range: string | null;
      country: string | null; state: string | null; city: string | null;
    };

    // Accept either UUID (companies tab) or Apollo source_id (person drawer)
    const companies = await leadsDb.unsafe<CompanyRow[]>(
      `SELECT id, source_id, name, domain, website_url, linkedin_url, industry, size_range, country, state, city
       FROM discover_companies WHERE id::text = $1 OR source_id = $1`,
      [id] as never[]
    );
    if (!companies.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const company = companies[0];
    // Apollo people store the hex source_id in company_id; demo people store the UUID
    const peopleKey = company.source_id ?? company.id;

    const [countRows, peopleRows] = await Promise.all([
      leadsDb.unsafe(
        `SELECT COUNT(*) AS total FROM discover_people WHERE company_id = $1`,
        [peopleKey] as never[]
      ),
      leadsDb.unsafe(`
        SELECT id, first_name, last_name, title, seniority, department,
               linkedin_url, email, email_status, phone,
               country, state, city, company_name, company_id
        FROM discover_people
        WHERE company_id = $1
        ORDER BY seniority, created_at
        LIMIT $2 OFFSET $3
      `, [peopleKey, limit, offset] as never[]),
    ]);

    const people_total = parseInt((countRows[0] as unknown as { total: string }).total, 10);
    const personIds = (peopleRows as unknown as { id: string }[]).map(r => r.id);

    const adminDb = createAdminClient();
    const revealMap = new Map<string, { email: string | null; phone: string | null; email_status: string | null; exported: boolean }>();
    if (personIds.length > 0) {
      const { data: reveals } = await adminDb
        .from("discover_reveals")
        .select("person_id, email, phone, email_status, exported_at")
        .eq("workspace_id", workspaceId)
        .in("person_id", personIds);
      for (const r of (reveals ?? [])) {
        revealMap.set(r.person_id, { email: r.email, phone: r.phone, email_status: r.email_status, exported: !!r.exported_at });
      }
    }

    const people = (peopleRows as Record<string, unknown>[]).map(r => {
      const rev = revealMap.get(r.id as string);
      return {
        id:               r.id           as string,
        company_id:       r.company_id   as string | null,
        first_name:       r.first_name   as string | null,
        last_name:        r.last_name    as string | null,
        title:            r.title        as string | null,
        seniority:        r.seniority    as string | null,
        department:       r.department   as string | null,
        linkedin_url:     r.linkedin_url as string | null,
        email_status:     ((rev ? rev.email_status : r.email_status) as string) ?? "unverified",
        country:          r.country      as string | null,
        state:            r.state        as string | null,
        city:             r.city         as string | null,
        company_name:     r.company_name as string | null,
        company_domain:   company.domain,
        company_industry: company.industry,
        company_size:     company.size_range,
        email_preview:    rev ? rev.email : maskEmail(r.email as string | null),
        phone_preview:    rev ? rev.phone : maskPhone(r.phone as string | null),
        has_email:        !!(r.email),
        has_phone:        !!(r.phone),
        revealed:         !!rev,
        exported:         rev?.exported ?? false,
      };
    });

    return NextResponse.json({ ...company, people, people_total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
