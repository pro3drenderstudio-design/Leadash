import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const KEY = "cohort_whatsapp_groups";
const DEFAULT_SLUG = "7-days-challenge";
const MAX_COHORTS = 52;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

interface GroupConfig { active_link_slug: string; groups: Record<string, string> }

async function readConfig(db: ReturnType<typeof createAdminClient>): Promise<GroupConfig> {
  const { data } = await db.from("admin_settings").select("value").eq("key", KEY).maybeSingle();
  const raw = data?.value;
  let cfg: Partial<GroupConfig> = {};
  try { cfg = typeof raw === "string" ? JSON.parse(raw) : (raw as Partial<GroupConfig>) ?? {}; } catch { cfg = {}; }
  return { active_link_slug: cfg.active_link_slug || DEFAULT_SLUG, groups: cfg.groups ?? {} };
}

/** GET — group links config + cohort state (current enrolling number, active link + its live destination). */
export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cfg = await readConfig(db);
  const { data: prod } = await db.from("academy_products").select("id").eq("slug", "challenge-7day").maybeSingle();
  const { data: current } = prod
    ? await db.from("academy_cohorts").select("cohort_number, name, starts_at").eq("product_id", prod.id).eq("is_default", true).maybeSingle()
    : { data: null };
  const { data: link } = await db.from("tracked_links").select("slug, title, destination_url").eq("slug", cfg.active_link_slug).maybeSingle();

  return NextResponse.json({
    max_cohorts: MAX_COHORTS,
    active_link_slug: cfg.active_link_slug,
    groups: cfg.groups,
    current_cohort_number: (current?.cohort_number as number | null) ?? null,
    current_cohort_name: (current?.name as string | null) ?? null,
    active_link: link ? { slug: link.slug, title: link.title, destination_url: link.destination_url } : null,
  });
}

/** PUT — save the group links + active-link slug. */
export async function PUT(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { active_link_slug?: string; groups?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Keep only 1..52 keys with non-empty trimmed URLs.
  const groups: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.groups ?? {})) {
    const n = parseInt(k, 10);
    if (n >= 1 && n <= MAX_COHORTS && typeof v === "string" && v.trim()) groups[String(n)] = v.trim();
  }
  const value: GroupConfig = { active_link_slug: (body.active_link_slug || DEFAULT_SLUG).trim(), groups };

  const { error } = await db.from("admin_settings")
    .upsert({ key: KEY, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...value });
}

/** POST — manually run the cohort scheduler ("Launch next challenge cohort"). */
export async function POST() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await db.rpc("run_cohort_scheduler");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result = (data ?? { created: 0, winners: [] }) as { created: number; winners: unknown[] };

  const { data: prod } = await db.from("academy_products").select("id").eq("slug", "challenge-7day").maybeSingle();
  const { data: current } = prod
    ? await db.from("academy_cohorts").select("cohort_number, name, starts_at").eq("product_id", prod.id).eq("is_default", true).maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok: true,
    created: result.created,
    current_cohort_number: (current?.cohort_number as number | null) ?? null,
    current_cohort_name: (current?.name as string | null) ?? null,
  });
}
