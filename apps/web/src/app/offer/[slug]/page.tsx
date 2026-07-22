import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { activeTargetForUser } from "@/lib/offers/targeting";
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
    let allowed = false;
    if (user) {
      // Admins can always preview a targeted offer (for QA / support).
      const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
      if (admin) {
        allowed = true;
      } else {
        const target = await activeTargetForUser(db, o.id, user.id);
        allowed = !!target;
        expiresAt = target?.expires_at ?? null;
      }
    }
    blocked = !allowed;
  }

  return <OfferSalesClient offer={o} slug={slug} blocked={blocked} expiresAt={expiresAt} />;
}
