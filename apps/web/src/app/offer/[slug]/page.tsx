import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveUserWorkspaceId } from "@/lib/offers/targeting";
import OfferSalesClient, { type SalesOffer } from "./OfferSalesClient";

export const dynamic = "force-dynamic";

/** Bespoke sales page for an offer (sponsored bundle + standalone academy).
 *  Public for untargeted offers; targeted offers require an active target. */
export default async function OfferSalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  const { data: offer } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (!offer || offer.status !== "active") notFound();

  const o = offer as unknown as SalesOffer & { id: string; is_targeted?: boolean };

  let blocked = false;
  let expiresAt: string | null = null;

  if (o.is_targeted) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let target: { expires_at: string | null } | null = null;
    if (user) {
      const wsId = await resolveUserWorkspaceId(db, user.id);
      if (wsId) {
        const { data } = await db.from("offer_targets").select("expires_at").eq("offer_id", o.id).eq("workspace_id", wsId).maybeSingle();
        target = (data as { expires_at: string | null } | null) ?? null;
      }
    }
    const active = target ? (!target.expires_at || new Date(target.expires_at) > new Date()) : false;
    blocked = !active;
    expiresAt = target?.expires_at ?? null;
  }

  return <OfferSalesClient offer={o} slug={slug} blocked={blocked} expiresAt={expiresAt} />;
}
