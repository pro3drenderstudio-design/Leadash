import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/extension-auth";
import { createHash } from "crypto";

interface IncomingLead {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  location?: string;
}

function placeholderEmail(lead: IncomingLead): string {
  // Deterministic placeholder based on LinkedIn URL or name
  const source = lead.linkedin_url ?? lead.name;
  const hash = createHash("md5").update(source.toLowerCase().trim()).digest("hex").slice(0, 12);
  return `linkedin_placeholder_${hash}@leadash.internal`;
}

function todayListName(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `LinkedIn Import ${yyyy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  let body: { leads?: IncomingLead[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leads = body.leads;
  if (!leads?.length) {
    return NextResponse.json({ error: "leads array required" }, { status: 400 });
  }

  // ── Find or create today's list ────────────────────────────────────────────
  const listName = todayListName();

  let listId: string;
  const { data: existingList } = await db
    .from("outreach_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", listName)
    .maybeSingle();

  if (existingList) {
    listId = existingList.id;
  } else {
    const { data: newList, error: listErr } = await db
      .from("outreach_lists")
      .insert({ workspace_id: workspaceId, name: listName })
      .select("id")
      .single();
    if (listErr || !newList) {
      return NextResponse.json({ error: listErr?.message ?? "Failed to create list" }, { status: 500 });
    }
    listId = newList.id;
  }

  // ── Fetch existing LinkedIn placeholder emails in this workspace ────────────
  // We deduplicate by linkedin_url via a custom_fields lookup, or fall back to
  // checking if the placeholder email already exists.
  const incomingUrls = leads
    .map((l) => l.linkedin_url)
    .filter(Boolean) as string[];

  // Build placeholder email set for existing leads with same URLs
  const existingEmails = new Set<string>();
  if (incomingUrls.length) {
    const placeholders = leads.map((l) => placeholderEmail(l));
    const { data: existing } = await db
      .from("outreach_leads")
      .select("email")
      .eq("workspace_id", workspaceId)
      .in("email", placeholders);
    (existing ?? []).forEach((r: { email: string }) => existingEmails.add(r.email));
  }

  // ── Build insert rows ──────────────────────────────────────────────────────
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const lead of leads) {
    const email = placeholderEmail(lead);
    if (existingEmails.has(email)) {
      skipped++;
      continue;
    }

    const [firstName, ...rest] = lead.name.trim().split(" ");
    const lastName = rest.join(" ") || null;

    const customFields: Record<string, string> = {};
    if (lead.linkedin_url) customFields["linkedin_url"] = lead.linkedin_url;
    if (lead.location) customFields["location"] = lead.location;

    toInsert.push({
      workspace_id: workspaceId,
      list_id: listId,
      email,
      first_name: firstName ?? null,
      last_name: lastName,
      company: lead.company ?? null,
      title: lead.title ?? null,
      verification_status: "pending",
      custom_fields: Object.keys(customFields).length ? customFields : null,
    });
  }

  let imported = 0;
  if (toInsert.length) {
    const { data, error } = await db
      .from("outreach_leads")
      .upsert(toInsert, { onConflict: "workspace_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported = data?.length ?? 0;
    skipped += toInsert.length - imported;
  }

  return NextResponse.json({ imported, skipped, list_id: listId });
}
