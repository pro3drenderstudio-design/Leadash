/**
 * Offer Builder — grant fulfillment.
 *
 * An OfferGrant describes something a buyer receives when they purchase an
 * Offer (a plan, inboxes, credits, community access, an academy product, a
 * dedicated IP, extra seats, or a custom/manual perk). fulfillGrant() maps
 * each grant type onto the existing fulfillment mechanism for that resource
 * (the same tables/columns the legacy webhook branches already write to).
 *
 * Every grant is wrapped in try/catch — a failure on one grant must never
 * block the others from being fulfilled, so callers always get back a
 * GrantedItem with a definitive status ("granted" | "pending_manual" | "failed").
 */
import type { createAdminClient } from "@/lib/supabase/server";
import type { OfferGrant, GrantedItem } from "@/types/offers";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { enqueueAutomation } from "@/lib/queue/client";

export interface GrantContext {
  workspaceId: string;
  userId: string;
  offerName: string;
  reference: string; // paystack reference, or "free:<purchase_id>" for $0 purchases
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function fulfillGrant(
  db: ReturnType<typeof createAdminClient>,
  grant: OfferGrant,
  ctx: GrantContext,
): Promise<GrantedItem> {
  try {
    switch (grant.type) {
      // ── Plan grant ──────────────────────────────────────────────────────────
      case "plan": {
        const plan = await getPlanById(grant.tier);
        const renewsAt = new Date(Date.now() + grant.months * 30 * DAY_MS).toISOString();
        const { error } = await db
          .from("workspaces")
          .update({
            plan_id:                plan.plan_id,
            plan_status:            "active",
            trial_ends_at:          null,
            subscription_renews_at: renewsAt,
            max_inboxes:            plan.max_inboxes,
            max_monthly_sends:      plan.max_monthly_sends,
            max_seats:              plan.max_seats,
            updated_at:             new Date().toISOString(),
          })
          .eq("id", ctx.workspaceId);
        if (error) throw error;

        // Grant the plan's included credits, mirroring what the billing webhook does.
        if (plan.included_credits > 0) {
          const { data: ws } = await db
            .from("workspaces")
            .select("lead_credits_balance")
            .eq("id", ctx.workspaceId)
            .single();
          await db.from("workspaces").update({
            lead_credits_balance:         (ws?.lead_credits_balance ?? 0) + plan.included_credits,
            subscription_credits_balance: plan.included_credits,
          }).eq("id", ctx.workspaceId);
          await db.from("lead_credit_transactions").insert({
            workspace_id:       ctx.workspaceId,
            type:               "grant",
            amount:             plan.included_credits,
            description:        `Offer purchase — ${ctx.offerName} (${plan.plan_id} plan credits)`,
            paystack_reference: `offer:${ctx.reference}:${grant.id}:plan_credits`,
          }).catch(() => {}); // best-effort — ignore dup on idempotent retry
        }

        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── Inbox grant ─────────────────────────────────────────────────────────
      case "inbox": {
        // freeMonths=0 means no trial period — use 1 year as a safe default rather
        // than now+0 which would expire the credit instantly.
        const monthsToAdd = grant.freeMonths > 0 ? grant.freeMonths : 12;
        const expiresAt = new Date(Date.now() + monthsToAdd * 30 * DAY_MS).toISOString();
        const { error } = await db.from("workspace_entitlements").insert({
          workspace_id:     ctx.workspaceId,
          entitlement_type: "inbox_credit",
          quantity:          grant.qty,
          expires_at:        expiresAt,
          source:            "offer_purchase",
          source_reference:  ctx.reference,
          is_active:         true,
        });
        if (error) throw error;
        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── Credits grant ───────────────────────────────────────────────────────
      case "credits": {
        // Insert the transaction first — if a unique-ish reference collides
        // (re-delivered webhook), skip the balance update to avoid double-grant.
        const txRef = `offer:${ctx.reference}:${grant.id}`;
        const { error: txErr } = await db.from("lead_credit_transactions").insert({
          workspace_id:       ctx.workspaceId,
          type:               "grant",
          amount:             grant.qty,
          description:        `Offer purchase — ${ctx.offerName}`,
          paystack_reference: txRef,
        });
        if (txErr) {
          // Unique violation = already granted for this purchase+grant — treat as success (idempotent retry)
          if ((txErr as { code?: string }).code === "23505") {
            return { grant_id: grant.id, type: grant.type, status: "granted", detail: "Already granted (idempotent retry)" };
          }
          throw txErr;
        }
        const { data: ws, error: wsErr } = await db
          .from("workspaces")
          .select("lead_credits_balance, subscription_credits_balance")
          .eq("id", ctx.workspaceId)
          .single();
        if (wsErr) throw wsErr;
        const update: Record<string, unknown> = {
          lead_credits_balance: (ws?.lead_credits_balance ?? 0) + grant.qty,
        };
        if (grant.recurring) update.subscription_credits_balance = grant.qty;
        const { error: updErr } = await db.from("workspaces").update(update).eq("id", ctx.workspaceId);
        if (updErr) throw updErr;
        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── Community grant ─────────────────────────────────────────────────────
      case "community": {
        // Fire-and-forget — the automation worker sends the actual WhatsApp invite.
        await enqueueAutomation({
          event:        "user.community_invite_granted",
          workspace_id: ctx.workspaceId,
          user_id:      ctx.userId,
          payload:      { invite_url: grant.inviteUrl, label: grant.label },
        }).catch(e => console.error("[offers/granters] community invite enqueue failed:", e));
        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── Academy grant ───────────────────────────────────────────────────────
      case "academy": {
        const { data: enrollment, error: enrollErr } = await db
          .from("academy_enrollments")
          .insert({
            user_id:            ctx.userId,
            workspace_id:       ctx.workspaceId,
            product_id:         grant.productId,
            cohort_id:          null,
            status:             "active",
            paystack_reference: ctx.reference,
            credits_granted:    false,
            enrolled_at:        new Date().toISOString(),
          })
          .select("id")
          .single();

        if (enrollErr) {
          // Unique violation on (user_id, product_id) or paystack_reference = already enrolled.
          if ((enrollErr as { code?: string }).code === "23505") {
            return { grant_id: grant.id, type: grant.type, status: "granted", detail: "Already enrolled (idempotent retry)" };
          }
          throw enrollErr;
        }

        // Mirror the academy webhook's included-credits behaviour.
        const { data: product } = await db
          .from("academy_products")
          .select("credits_grant, name")
          .eq("id", grant.productId)
          .maybeSingle();

        if (product && product.credits_grant > 0 && enrollment) {
          const { data: ws } = await db
            .from("workspaces")
            .select("lead_credits_balance")
            .eq("id", ctx.workspaceId)
            .single();
          if (ws) {
            await db.from("workspaces")
              .update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + product.credits_grant })
              .eq("id", ctx.workspaceId);
            await db.from("lead_credit_transactions").insert({
              workspace_id:       ctx.workspaceId,
              type:               "grant",
              amount:             product.credits_grant,
              description:        `Academy enrollment — ${product.name}`,
              paystack_reference: `offer:${ctx.reference}:${grant.id}:academy_credits`,
            }).then(undefined, () => {}); // best-effort — don't fail the grant if this dup-collides
            await db.from("academy_enrollments").update({ credits_granted: true }).eq("id", enrollment.id);
          }
        }

        enqueueAutomation({
          event:        "academy.enrollment_created",
          workspace_id: ctx.workspaceId,
          user_id:      ctx.userId,
          payload:      { product_id: grant.productId, enrollment_id: enrollment?.id ?? null, access_type: "admin_granted" },
        }).catch(() => {});

        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── IP grant ────────────────────────────────────────────────────────────
      case "ip": {
        const { error } = await db.from("dedicated_ip_subscriptions").insert({
          workspace_id: ctx.workspaceId,
          status:       "pending",
          notes:        `Granted via offer: ${ctx.offerName} (ref: ${ctx.reference})`,
        });
        if (error) throw error;
        return { grant_id: grant.id, type: grant.type, status: "pending_manual", detail: "Dedicated IP provisioning pending" };
      }

      // ── Seats grant ─────────────────────────────────────────────────────────
      case "seats": {
        const { data: ws, error: wsErr } = await db
          .from("workspaces")
          .select("max_seats")
          .eq("id", ctx.workspaceId)
          .single();
        if (wsErr) throw wsErr;
        const { error } = await db
          .from("workspaces")
          .update({ max_seats: (ws?.max_seats ?? 1) + grant.qty })
          .eq("id", ctx.workspaceId);
        if (error) throw error;
        return { grant_id: grant.id, type: grant.type, status: "granted" };
      }

      // ── Custom grant — never auto-fulfilled ────────────────────────────────
      case "custom": {
        enqueueAutomation({
          event:        "offers.custom_grant_pending",
          workspace_id: ctx.workspaceId,
          user_id:      ctx.userId,
          payload:      { offer_name: ctx.offerName, reference: ctx.reference, description: grant.description ?? null },
        }).catch(() => {});
        return { grant_id: grant.id, type: grant.type, status: "pending_manual", detail: grant.description || "Requires manual fulfillment" };
      }

      default: {
        // Exhaustiveness guard — should be unreachable given OfferGrant's discriminated union.
        const unknownGrant = grant as { id: string; type: string };
        return { grant_id: unknownGrant.id, type: unknownGrant.type as OfferGrant["type"], status: "failed", detail: "Unknown grant type" };
      }
    }
  } catch (err) {
    return {
      grant_id: grant.id,
      type:     grant.type,
      status:   "failed",
      detail:   err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function fulfillAllGrants(
  db: ReturnType<typeof createAdminClient>,
  grants: OfferGrant[],
  ctx: GrantContext,
): Promise<GrantedItem[]> {
  const results: GrantedItem[] = [];
  for (const grant of grants) {
    // fulfillGrant never throws — every path returns a GrantedItem — but guard
    // anyway so a truly unexpected exception still can't abort the loop.
    try {
      results.push(await fulfillGrant(db, grant, ctx));
    } catch (err) {
      results.push({
        grant_id: grant.id,
        type:     grant.type,
        status:   "failed",
        detail:   err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
  return results;
}

/**
 * Best-effort revoke for refunds. Each branch is independent and swallows its
 * own errors (logged via console.warn/error) — a refund should never fail
 * outright because a revoke step had trouble; the admin can always finish
 * cleanup manually using the purchase + offer records.
 */
export async function revokeGrant(
  db: ReturnType<typeof createAdminClient>,
  grant: OfferGrant,
  ctx: { workspaceId: string; reference: string },
): Promise<void> {
  try {
    switch (grant.type) {
      case "plan": {
        // Downgrading a live plan on refund is risky (could yank access mid-cycle
        // for reasons unrelated to this purchase) — log for manual admin action.
        console.warn(
          `[offers/granters] revokeGrant(plan): workspace=${ctx.workspaceId} ref=${ctx.reference} — ` +
          `plan downgrade NOT automated, action manually if needed.`,
        );
        return;
      }

      case "inbox": {
        const { error } = await db
          .from("workspace_entitlements")
          .update({ is_active: false })
          .eq("workspace_id", ctx.workspaceId)
          .eq("source", "offer_purchase")
          .eq("source_reference", ctx.reference);
        if (error) console.error("[offers/granters] revokeGrant(inbox) failed:", error);
        return;
      }

      case "credits": {
        const txRef = `offer:${ctx.reference}:${grant.id}`;
        const { data: original } = await db
          .from("lead_credit_transactions")
          .select("amount")
          .eq("paystack_reference", txRef)
          .maybeSingle();
        const qty = original?.amount ?? grant.qty;

        const { data: ws } = await db
          .from("workspaces")
          .select("lead_credits_balance")
          .eq("id", ctx.workspaceId)
          .single();
        if (ws) {
          const newBalance = Math.max(0, (ws.lead_credits_balance ?? 0) - qty);
          await db.from("workspaces").update({ lead_credits_balance: newBalance }).eq("id", ctx.workspaceId);
          await db.from("lead_credit_transactions").insert({
            workspace_id:       ctx.workspaceId,
            type:               "refund",
            amount:             -qty,
            description:        "Offer purchase refunded — credits revoked",
            paystack_reference: `${txRef}:revoke`,
          }).then(undefined, () => {}); // best-effort — ignore dup on repeated refund calls
        }
        return;
      }

      case "community": {
        console.warn(
          `[offers/granters] revokeGrant(community): workspace=${ctx.workspaceId} ref=${ctx.reference} — ` +
          `cannot programmatically remove a WhatsApp community member; action manually if needed.`,
        );
        return;
      }

      case "academy": {
        const { error } = await db
          .from("academy_enrollments")
          .update({ status: "cancelled" })
          .eq("paystack_reference", ctx.reference);
        if (error) console.error("[offers/granters] revokeGrant(academy) failed:", error);
        return;
      }

      case "ip": {
        const { error } = await db
          .from("dedicated_ip_subscriptions")
          .update({ status: "cancelled" })
          .eq("workspace_id", ctx.workspaceId)
          .ilike("notes", `%${ctx.reference}%`);
        if (error) console.error("[offers/granters] revokeGrant(ip) failed:", error);
        return;
      }

      case "seats": {
        const { data: ws } = await db
          .from("workspaces")
          .select("max_seats")
          .eq("id", ctx.workspaceId)
          .single();
        if (ws) {
          const newSeats = Math.max(1, (ws.max_seats ?? 1) - grant.qty);
          await db.from("workspaces").update({ max_seats: newSeats }).eq("id", ctx.workspaceId);
        }
        return;
      }

      case "custom": {
        return; // no-op — never auto-fulfilled, nothing to revoke
      }
    }
  } catch (err) {
    console.error(`[offers/granters] revokeGrant(${grant.type}) threw:`, err);
  }
}
