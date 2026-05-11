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

  try {
    type PersonRow = {
      id: string; company_id: string | null; first_name: string | null; last_name: string | null;
      title: string | null; seniority: string | null; department: string | null; sub_role: string | null;
      linkedin_url: string | null; email: string | null; email_status: string | null; phone: string | null;
      country: string | null; state: string | null; city: string | null;
      company_name: string | null; company_domain: string | null; company_industry: string | null;
      company_size: string | null; company_website: string | null; company_linkedin: string | null;
      gender: string | null; birth_year: number | null; skills: string | null; summary: string | null;
      job_summary: string | null; inferred_salary: string | null; years_experience: number | null;
      linkedin_connections: number | null; facebook_url: string | null; twitter_url: string | null;
      github_url: string | null; interests: string | null; start_date: string | null;
    };

    const rows = await leadsDb.unsafe<PersonRow[]>(`
      SELECT p.id, p.company_id, p.first_name, p.last_name, p.title, p.seniority, p.department, p.sub_role,
             p.linkedin_url, p.email, p.email_status, p.phone,
             p.country, p.state, p.city, p.company_name,
             p.gender, p.birth_year, p.skills, p.summary, p.job_summary,
             p.inferred_salary, p.years_experience, p.linkedin_connections,
             p.facebook_url, p.twitter_url, p.github_url, p.interests, p.start_date,
             c.domain AS company_domain, c.industry AS company_industry, c.size_range AS company_size,
             c.website_url AS company_website, c.linkedin_url AS company_linkedin
      FROM discover_people p
      LEFT JOIN discover_companies c ON c.id = p.company_id
      WHERE p.id = $1::uuid
    `, [id] as never[]);

    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const person = rows[0];

    // Fetch reveal state for this person
    const adminDb = createAdminClient();
    const { data: reveal } = await adminDb
      .from("discover_reveals")
      .select("email, phone, email_status, exported_at")
      .eq("workspace_id", workspaceId)
      .eq("person_id", id)
      .maybeSingle();

    const revealed = !!reveal;

    // Fetch coworkers (same company, different person, capped at 6)
    let coworkers: unknown[] = [];
    if (person.company_id) {
      const cwRows = await leadsDb.unsafe(`
        SELECT p2.id, p2.first_name, p2.last_name, p2.title, p2.seniority,
               p2.email, p2.phone, p2.email_status, p2.linkedin_url,
               p2.country, p2.state, p2.city, p2.company_name, p2.company_id,
               c.domain AS company_domain, c.industry AS company_industry, c.size_range AS company_size
        FROM discover_people p2
        LEFT JOIN discover_companies c ON c.id = p2.company_id
        WHERE p2.company_id = $1::uuid AND p2.id <> $2::uuid
        ORDER BY p2.seniority, p2.created_at
        LIMIT 6
      `, [person.company_id, id] as never[]);

      // Fetch reveals for coworkers
      const cwIds = (cwRows as unknown as { id: string }[]).map(r => r.id);
      const cwRevealMap = new Map<string, { email: string | null; phone: string | null; email_status: string | null }>();
      if (cwIds.length > 0) {
        const { data: cwReveals } = await adminDb
          .from("discover_reveals")
          .select("person_id, email, phone, email_status")
          .eq("workspace_id", workspaceId)
          .in("person_id", cwIds);
        for (const r of (cwReveals ?? [])) {
          cwRevealMap.set(r.person_id, { email: r.email, phone: r.phone, email_status: r.email_status });
        }
      }

      coworkers = (cwRows as Record<string, unknown>[]).map(r => {
        const rev = cwRevealMap.get(r.id as string);
        return {
          ...r,
          email_preview: rev ? rev.email : maskEmail(r.email as string | null),
          phone_preview: rev ? rev.phone : maskPhone(r.phone as string | null),
          email_status:  (rev ? rev.email_status : r.email_status) ?? "unverified",
          has_email: !!(r.email), has_phone: !!(r.phone),
          revealed: !!rev, exported: false,
        };
      });
    }

    return NextResponse.json({
      ...person,
      email:           revealed ? reveal!.email        : null,
      phone:           revealed ? reveal!.phone        : null,
      email_status:    revealed ? reveal!.email_status : person.email_status,
      email_preview:   revealed ? reveal!.email        : maskEmail(person.email),
      phone_preview:   revealed ? reveal!.phone        : maskPhone(person.phone),
      has_email:       !!(person.email),
      has_phone:       !!(person.phone),
      revealed,
      exported:        !!reveal?.exported_at,
      company_website: person.company_website,
      company_linkedin:person.company_linkedin,
      coworkers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
