import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Block } from "@/lib/funnel-blocks/types";
import { resolveFunnelVariableValues, interpolateFunnelVariables } from "@/lib/funnel-blocks/variables";
import FunnelPageRenderer from "./FunnelPageRenderer";

interface PublicPageProps {
  params: Promise<{ funnelSlug: string; pageSlug: string }>;
}

interface VariantRow { id: string; page_id: string; traffic_pct: number }

/** Weighted-random pick; falls back to equal weights if all splits are 0. */
function weightedPick(variants: VariantRow[]): VariantRow {
  const total = variants.reduce((s, v) => s + Math.max(0, v.traffic_pct), 0);
  if (total <= 0) return variants[Math.floor(Math.random() * variants.length)];
  let r = Math.random() * total;
  for (const v of variants) {
    r -= Math.max(0, v.traffic_pct);
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}

export default async function PublicFunnelPage({ params }: PublicPageProps) {
  const { funnelSlug, pageSlug } = await params;
  const db = createAdminClient();

  const { data: funnel } = await db
    .from("funnels")
    .select("id, name, slug, custom_domain, global_styles, settings")
    .eq("slug", funnelSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!funnel) notFound();

  const { data: page } = await db
    .from("funnel_pages")
    .select("id, name, slug, page_type, blocks, settings, connection")
    .eq("funnel_id", funnel.id)
    .eq("slug", pageSlug)
    .eq("status", "published")
    .maybeSingle();
  if (!page) notFound();

  // ── A/B test assignment ───────────────────────────────────────────────────
  // If a running test uses this page as its control, serve one of the variant
  // pages (sticky per visitor via a cookie). Rendering the variant page's own
  // id means view/conversion events attribute to that variant automatically.
  let renderPageId = page.id as string;
  let renderName = page.name as string;
  let renderBlocks = (page.blocks ?? []) as Block[];
  let renderSettings = (page.settings ?? {}) as Record<string, unknown>;
  let renderConnection = (page.connection ?? {}) as Record<string, unknown>;
  let abCookie: { name: string; pageId: string } | null = null;

  const { data: abTest } = await db
    .from("funnel_ab_tests")
    .select("id")
    .eq("funnel_id", funnel.id)
    .eq("control_page_id", page.id)
    .eq("status", "running")
    .maybeSingle();

  if (abTest) {
    const { data: variantsData } = await db
      .from("funnel_ab_variants")
      .select("id, page_id, traffic_pct")
      .eq("test_id", abTest.id);
    const variants = (variantsData ?? []) as VariantRow[];
    if (variants.length > 0) {
      const cookieName = `abv_${abTest.id}`;
      const stored = (await cookies()).get(cookieName)?.value;
      const chosen = variants.find((v) => v.page_id === stored) ?? weightedPick(variants);
      abCookie = { name: cookieName, pageId: chosen.page_id };
      if (chosen.page_id !== page.id) {
        const { data: vp } = await db
          .from("funnel_pages")
          .select("id, name, blocks, settings, connection")
          .eq("id", chosen.page_id)
          .eq("status", "published")
          .maybeSingle();
        if (vp) {
          renderPageId = vp.id as string;
          renderName = vp.name as string;
          renderBlocks = (vp.blocks ?? []) as Block[];
          renderSettings = (vp.settings ?? {}) as Record<string, unknown>;
          renderConnection = (vp.connection ?? {}) as Record<string, unknown>;
        }
      }
    }
  }

  // ── Dynamic variables (e.g. {next_active_cohort_date}) ────────────────────
  const varValues = await resolveFunnelVariableValues(db);
  renderBlocks = interpolateFunnelVariables(renderBlocks, varValues);

  return (
    <>
      {abCookie && (
        // Persist the assigned variant so the visitor sticks to it on return.
        <script
          dangerouslySetInnerHTML={{
            __html: `document.cookie=${JSON.stringify(`${abCookie.name}=${abCookie.pageId}; path=/; max-age=2592000; samesite=lax`)}`,
          }}
        />
      )}
      <FunnelPageRenderer
        funnelId={funnel.id}
        funnelSlug={funnelSlug}
        pageId={renderPageId}
        pageSlug={pageSlug}
        pageName={renderName}
        blocks={renderBlocks}
        settings={renderSettings}
        connection={renderConnection}
        globalStyles={(funnel.global_styles as Record<string, unknown>) ?? {}}
        tracking={((funnel.settings as Record<string, unknown> | null)?.tracking as Record<string, unknown> | undefined) ?? null}
      />
    </>
  );
}

export async function generateMetadata({ params }: PublicPageProps) {
  const { funnelSlug, pageSlug } = await params;
  const db = createAdminClient();
  const { data: funnel } = await db.from("funnels").select("id, name").eq("slug", funnelSlug).maybeSingle();
  if (!funnel) return {};
  const { data: page } = await db.from("funnel_pages").select("name").eq("funnel_id", funnel.id).eq("slug", pageSlug).maybeSingle();
  return {
    title: page?.name ?? funnel.name,
  };
}
