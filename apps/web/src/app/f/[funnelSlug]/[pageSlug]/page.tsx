import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import FunnelPageRenderer from "./FunnelPageRenderer";

interface Block {
  id:    string;
  type:  string;
  props: Record<string, unknown>;
}

interface PublicPageProps {
  params: Promise<{ funnelSlug: string; pageSlug: string }>;
}

export default async function PublicFunnelPage({ params }: PublicPageProps) {
  const { funnelSlug, pageSlug } = await params;
  const db = createAdminClient();

  // Fetch funnel by slug
  const { data: funnel } = await db
    .from("funnels")
    .select("id, name, slug, custom_domain, global_styles, settings")
    .eq("slug", funnelSlug)
    .eq("status", "active")
    .maybeSingle();

  if (!funnel) notFound();

  // Fetch page by slug
  const { data: page } = await db
    .from("funnel_pages")
    .select("id, name, slug, page_type, blocks, settings, connection")
    .eq("funnel_id", funnel.id)
    .eq("slug", pageSlug)
    .eq("status", "published")
    .maybeSingle();

  if (!page) notFound();

  const blocks = (page.blocks ?? []) as Block[];

  return (
    <FunnelPageRenderer
      funnelId={funnel.id}
      funnelSlug={funnelSlug}
      pageId={page.id}
      pageSlug={pageSlug}
      pageName={page.name}
      blocks={blocks}
      settings={page.settings ?? {}}
      connection={page.connection ?? {}}
      globalStyles={(funnel.global_styles as Record<string, unknown>) ?? {}}
    />
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
