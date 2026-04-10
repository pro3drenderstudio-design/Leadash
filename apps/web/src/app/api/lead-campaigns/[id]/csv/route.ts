import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const CSV_HEADERS = [
  "firstName", "lastName", "fullName", "email", "phone",
  "position", "seniority", "department",
  "linkedinUrl", "city", "country",
  "orgName", "orgIndustry", "orgWebsite", "orgLinkedinUrl",
  "orgCity", "orgState", "orgCountry", "orgSize",
  "orgDescription", "orgFoundedYear",
  "verificationStatus", "personalizedLine",
];

const DB_TO_CSV: Record<string, string> = {
  first_name:        "firstName",
  last_name:         "lastName",
  email:             "email",
  phone:             "phone",
  title:             "position",
  seniority:         "seniority",
  department:        "department",
  linkedin_url:      "linkedinUrl",
  location:          "city",          // location col holds "city, country"
  company:           "orgName",
  industry:          "orgIndustry",
  website:           "orgWebsite",
  org_linkedin_url:  "orgLinkedinUrl",
  org_city:          "orgCity",
  org_state:         "orgState",
  org_country:       "orgCountry",
  org_size:          "orgSize",
  org_description:   "orgDescription",
  org_founded_year:  "orgFoundedYear",
  verification_status: "verificationStatus",
  personalized_line:   "personalizedLine",
};

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: leads } = await db
    .from("lead_campaign_leads")
    .select("*")
    .eq("campaign_id", id)
    .eq("workspace_id", workspaceId)
    .order("created_at");

  if (!leads?.length) {
    return new NextResponse("No leads", { status: 404 });
  }

  // Build row map
  const rows = leads.map((row: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {};
    // Derive fullName
    const fn = row.first_name ?? "";
    const ln = row.last_name  ?? "";
    mapped["fullName"] = [fn, ln].filter(Boolean).join(" ");
    for (const [dbCol, csvCol] of Object.entries(DB_TO_CSV)) {
      mapped[csvCol] = row[dbCol] ?? "";
    }
    return mapped;
  });

  const lines: string[] = [
    CSV_HEADERS.join(","),
    ...rows.map((r: Record<string, unknown>) => CSV_HEADERS.map(h => escapeCell(r[h])).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type":        "text/csv",
      "Content-Disposition": `attachment; filename="leads-${id.slice(0, 8)}.csv"`,
    },
  });
}
