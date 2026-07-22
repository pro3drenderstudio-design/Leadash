import { redirect, notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Block } from "@/lib/funnel-blocks/types";
import { resolveFunnelVariableValues, interpolateFunnelVariables } from "@/lib/funnel-blocks/variables";
import FunnelPageRenderer from "@/app/f/[funnelSlug]/[pageSlug]/FunnelPageRenderer";

interface PreviewPageProps {
  params: Promise<{ funnelId: string; pageId: string }>;
}

// Admin-only preview: renders a funnel page by id regardless of its (or its
// funnel's) publish status, so drafts can be checked before going live.
// Distinct from /f/[funnelSlug]/[pageSlug], which requires both to be live —
// that route 404s on drafts, which is exactly what made this one necessary.
export default async function FunnelPreviewPage({ params }: PreviewPageProps) {
  const { funnelId, pageId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/dashboard");

  const [funnelRes, pageRes] = await Promise.all([
    db.from("funnels").select("id, name, slug, status, global_styles, settings").eq("id", funnelId).maybeSingle(),
    db.from("funnel_pages").select("id, name, slug, page_type, status, blocks, settings, connection").eq("id", pageId).eq("funnel_id", funnelId).maybeSingle(),
  ]);

  if (!funnelRes.data || !pageRes.data) notFound();

  const funnel = funnelRes.data;
  const page = pageRes.data;
  // Resolve dynamic variables ({next_active_cohort_date}, …) so the preview
  // matches exactly what the live page will render.
  const varValues = await resolveFunnelVariableValues(db);
  const blocks = interpolateFunnelVariables((page.blocks ?? []) as Block[], varValues);
  const isLive = funnel.status === "active" && page.status === "published";

  return (
    <div>
      <div style={{
        position: "sticky", top: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 600,
        background: isLive ? "#0f3d2e" : "#3d2e0f", color: isLive ? "#6ee7b7" : "#fbbf24",
        borderBottom: `1px solid ${isLive ? "#1f6b4f" : "#6b4f1f"}`,
      }}>
        Admin Preview — {page.name}
        {!isLive && (
          <span style={{ opacity: 0.85 }}>
            · {funnel.status !== "active" ? "funnel not active" : "page not published"} (won&apos;t be visible to visitors yet)
          </span>
        )}
      </div>
      <FunnelPageRenderer
        funnelId={funnel.id}
        funnelSlug={funnel.slug}
        pageId={page.id}
        pageSlug={page.slug}
        pageName={page.name}
        blocks={blocks}
        settings={(page.settings as Record<string, unknown>) ?? {}}
        connection={(page.connection as Record<string, unknown>) ?? {}}
        globalStyles={(funnel.global_styles as Record<string, unknown>) ?? {}}
        preview
      />
    </div>
  );
}

export async function generateMetadata({ params }: PreviewPageProps) {
  const { funnelId, pageId } = await params;
  const db = createAdminClient();
  const { data: page } = await db.from("funnel_pages").select("name").eq("id", pageId).eq("funnel_id", funnelId).maybeSingle();
  return {
    title: page?.name ? `Preview: ${page.name}` : "Funnel Preview",
    robots: { index: false, follow: false },
  };
}
