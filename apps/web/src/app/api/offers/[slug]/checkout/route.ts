/**
 * POST /api/offers/[slug]/checkout — public.
 *
 * Handles both lightweight funnel-event logging ("started" / "payment_added")
 * and the real checkout submit (creates the offer_purchases row, resolves /
 * creates the buyer's workspace, and either fulfills a free purchase instantly
 * or kicks off a Paystack checkout for a paid one).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/rate-limit";
import { fulfillAllGrants } from "@/lib/offers/granters";
import { hasActiveOfferTarget } from "@/lib/offers/targeting";
import { enqueueAutomation } from "@/lib/queue/client";
import type { Offer, OfferLineItem, GrantedItem } from "@/types/offers";

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const API_KEY    = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "no-reply@notifications.leadash.com";

interface CheckoutBody {
  session_id?: string;
  buyer?: { full_name?: string; email?: string; phone?: string; [key: string]: string | undefined };
  bump_ids?: string[];
  discount_code?: string;
  event?: "started" | "payment_added";
  funnel_id?: string;
  pwyw_price_ngn?: number;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  let body: CheckoutBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sessionId = body.session_id;
  if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });

  const { data: offerRow, error: offerErr } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
  if (!offerRow) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  const offer = offerRow as Offer;

  // ── Lightweight funnel-event logging (no buyer fields required) ───────────
  if (body.event && !body.buyer?.email) {
    await db.from("offer_checkout_events").insert({
      offer_id:   offer.id,
      session_id: sessionId,
      event_type: body.event,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Real checkout submit ────────────────────────────────────────────────────
  const rateLimitKey = `offers:checkout:${sessionId || ip}`;
  const allowed = await checkRateLimit(db, rateLimitKey, 5, 60 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  if (offer.status === "paused") {
    return NextResponse.json({ error: "This offer is currently unavailable." }, { status: 410 });
  }

  const isExpired = offer.expires_at ? new Date(offer.expires_at) < new Date() : false;
  if (isExpired && offer.on_expire !== "full_price") {
    const message = offer.on_expire === "waitlist"
      ? "This offer has closed. Join the waitlist to be notified when it reopens."
      : "This offer has closed.";
    return NextResponse.json({ error: message }, { status: 410 });
  }

  if (offer.stock_limit !== null) {
    const { count } = await db
      .from("offer_purchases")
      .select("*", { count: "exact", head: true })
      .eq("offer_id", offer.id)
      .eq("status", "paid");
    if ((count ?? 0) >= offer.stock_limit) {
      return NextResponse.json({ error: "This offer is sold out." }, { status: 410 });
    }
  }

  const buyer = body.buyer;
  if (!buyer?.email || !buyer.email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  // Validate required checkout fields.
  for (const field of offer.checkout.fields) {
    if (field.enabled && field.required) {
      const value = buyer[field.key];
      if (!value || !value.trim()) {
        return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 });
      }
    }
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────
  const bumpIds = Array.isArray(body.bump_ids) ? body.bump_ids : [];
  const activeBumps = offer.bumps.filter(b => b.is_active && bumpIds.includes(b.id));
  const baseNgn = offer.pricing_model === "pwyw" && typeof body.pwyw_price_ngn === "number"
    ? Math.max(body.pwyw_price_ngn, offer.pwyw_min_ngn ?? 0)
    : offer.price_ngn;
  const subtotal_ngn = baseNgn + activeBumps.reduce((sum, b) => sum + b.price_ngn, 0);

  let discount_ngn = 0;
  let discountCodeId: string | null = null;
  if (body.discount_code) {
    const codeUpper = body.discount_code.trim().toUpperCase();
    const { data: discountCode } = await db
      .from("offer_discount_codes")
      .select("*")
      .eq("offer_id", offer.id)
      .eq("code", codeUpper)
      .maybeSingle();

    const valid = discountCode
      && discountCode.is_active
      && (discountCode.max_redemptions === null || discountCode.redemptions < discountCode.max_redemptions);

    if (!valid) {
      return NextResponse.json({ error: "Invalid discount code" }, { status: 400 });
    }

    discountCodeId = discountCode.id;
    discount_ngn = discountCode.kind === "percent"
      ? Math.round(subtotal_ngn * discountCode.value / 100)
      : Math.min(discountCode.value, subtotal_ngn);
  }

  const total_ngn = Math.max(0, subtotal_ngn - discount_ngn);

  const line_items: OfferLineItem[] = [
    { kind: "base", label: offer.name, amount_ngn: baseNgn },
    ...activeBumps.map(b => ({ kind: "bump" as const, label: b.label, amount_ngn: b.price_ngn })),
  ];

  // ── Resolve buyer identity / workspace ──────────────────────────────────────
  let workspaceId: string | null = null;
  let userId: string | null = null;

  const supabase = await createClient();
  const { data: { user: authedUser } } = await supabase.auth.getUser();

  if (authedUser) {
    userId = authedUser.id;
    const { data: member } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", authedUser.id)
      .limit(1)
      .maybeSingle();
    workspaceId = member?.workspace_id ?? null;
  } else {
    const { data: existingUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === buyer.email!.toLowerCase());

    if (existingUser) {
      userId = existingUser.id;
      const { data: member } = await db
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", existingUser.id)
        .limit(1)
        .maybeSingle();
      workspaceId = member?.workspace_id ?? null;
    } else if (offer.no_workspace_action === "attach_by_email") {
      // No account created — buyer info is still recorded on the purchase row.
      workspaceId = null;
      userId = null;
    } else {
      // 'create' or 'invite' — provision a new auth user + workspace.
      const created = await createWorkspaceForBuyer(db, {
        email:           buyer.email!.toLowerCase(),
        fullName:        buyer.full_name?.trim() || buyer.email!.split("@")[0],
        action:          offer.no_workspace_action,
        postSignupPath:  offer.grants.some(g => g.type === "inbox") ? "/inboxes/new" : "/dashboard",
      });
      if (!created) {
        return NextResponse.json({ error: "Account setup failed. Please try again." }, { status: 500 });
      }
      userId = created.userId;
      workspaceId = created.workspaceId;
    }
  }

  // Targeted offers require an active target for the resolved workspace.
  if ((offer as unknown as { is_targeted?: boolean }).is_targeted) {
    const ok = await hasActiveOfferTarget(db, offer.id, workspaceId);
    if (!ok) return NextResponse.json({ error: "This offer isn't available for your account." }, { status: 403 });
  }

  // Link any anonymous CRM contact (e.g. a funnel opt-in lead) created under
  // this same email before the buyer had an account/workspace, so their
  // journey (opt-in → challenge → purchase) shows up as one contact timeline.
  if (workspaceId && userId) {
    await db.from("crm_contacts")
      .update({ user_id: userId, workspace_id: workspaceId })
      .ilike("email", buyer.email!)
      .is("user_id", null);
  }

  // ── Currency for display purposes only — actual charge is always NGN/kobo ──
  const currency: "NGN" | "USD" = offer.currency_mode === "usd_only" ? "USD" : "NGN";

  // Last-touch funnel attribution (set client-side when the buyer arrived via
  // an in-funnel CTA) — validated against a real funnel so a stale/forged id
  // never breaks checkout or gets stored as garbage.
  let funnelId: string | null = null;
  if (body.funnel_id) {
    const { data: attributedFunnel } = await db.from("funnels").select("id").eq("id", body.funnel_id).maybeSingle();
    funnelId = attributedFunnel?.id ?? null;
  }

  const { data: purchase, error: purchaseErr } = await db
    .from("offer_purchases")
    .insert({
      offer_id:         offer.id,
      workspace_id:     workspaceId,
      user_id:          userId,
      buyer_name:       buyer.full_name?.trim() || null,
      buyer_email:      buyer.email!.toLowerCase(),
      buyer_phone:      buyer.phone?.trim() || null,
      line_items,
      discount_code_id: discountCodeId,
      subtotal_ngn,
      discount_ngn,
      total_ngn,
      currency,
      status:           "pending",
      funnel_id:        funnelId,
    })
    .select()
    .single();

  if (purchaseErr || !purchase) {
    console.error("[offers/checkout] purchase insert failed:", purchaseErr);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }

  // ── Free path ────────────────────────────────────────────────────────────────
  if (total_ngn === 0) {
    let grantedItems: GrantedItem[];
    if (workspaceId && userId) {
      grantedItems = await fulfillAllGrants(db, offer.grants, {
        workspaceId,
        userId,
        offerName: offer.name,
        reference: `free:${purchase.id}`,
      });
    } else {
      grantedItems = offer.grants.map(g => ({ grant_id: g.id, type: g.type, status: "pending_manual" as const, detail: "No workspace on purchase" }));
    }

    await db.from("offer_purchases").update({
      status:       "paid",
      granted_at:   new Date().toISOString(),
      granted_items: grantedItems,
    }).eq("id", purchase.id);

    if (discountCodeId) {
      const { data: dc } = await db.from("offer_discount_codes").select("redemptions").eq("id", discountCodeId).single();
      if (dc) await db.from("offer_discount_codes").update({ redemptions: dc.redemptions + 1 }).eq("id", discountCodeId);
    }

    await db.from("offer_checkout_events").insert({ offer_id: offer.id, session_id: sessionId, event_type: "purchased" });

    if (workspaceId && userId) {
      enqueueAutomation({
        event:        "offers.purchase_created",
        workspace_id: workspaceId,
        user_id:      userId,
        payload:      { offer_id: offer.id, offer_name: offer.name, total_ngn: 0, purchase_id: purchase.id },
      }).catch(() => {});
    }

    return NextResponse.json({ free: true, purchase_id: purchase.id });
  }

  // ── Paid path ────────────────────────────────────────────────────────────────
  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email:       buyer.email!,
      amountKobo:  total_ngn * 100,
      callbackUrl: `${APP_URL}/o/${slug}/success?purchase_id=${purchase.id}`,
      metadata: {
        type:         "offer_purchase",
        purchase_id:  purchase.id,
        offer_id:     offer.id,
        workspace_id: workspaceId,
        user_id:      userId,
      },
    });
    return NextResponse.json({ url: authorizationUrl, purchase_id: purchase.id });
  } catch (err) {
    console.error("[offers/checkout] Paystack init failed:", err);
    await db.from("offer_purchases").update({ status: "failed" }).eq("id", purchase.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initialization failed." },
      { status: 502 },
    );
  }
}

async function createWorkspaceForBuyer(
  db: ReturnType<typeof createAdminClient>,
  opts: { email: string; fullName: string; action: "create" | "invite"; postSignupPath?: string },
): Promise<{ userId: string; workspaceId: string } | null> {
  const tempPassword = crypto.randomUUID().replace(/-/g, "") + "Aa1!";

  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email:         opts.email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName, funnel_source: "offer_checkout" },
  });
  if (authErr || !authData.user) {
    console.error("[offers/checkout] createUser error:", authErr);
    return null;
  }
  const userId = authData.user.id;

  const slug = `${opts.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36)}`;
  const { data: workspace, error: wsErr } = await db
    .from("workspaces")
    .insert({
      name:          opts.fullName,
      slug,
      owner_id:      userId,
      plan_id:       "free",
      plan_status:   "trialing",
      billing_email: opts.email,
    })
    .select("id")
    .single();

  if (wsErr || !workspace) {
    await db.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[offers/checkout] workspace creation error:", wsErr);
    return null;
  }

  const { error: memErr } = await db.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id:      userId,
    role:         "owner",
  });
  if (memErr) {
    await db.from("workspaces").delete().eq("id", workspace.id).then(undefined, () => {});
    await db.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[offers/checkout] workspace_member error:", memErr);
    return null;
  }

  await db.from("workspace_settings").insert({ workspace_id: workspace.id }).then(undefined, () => {});

  // ── Send access email — magic link for "create", invite link for "invite" ──
  const linkType = opts.action === "invite" ? "invite" : "magiclink";
  const { data: linkData } = await db.auth.admin.generateLink({
    type:    linkType,
    email:   opts.email,
    options: { redirectTo: `${APP_URL}${opts.postSignupPath ?? "/dashboard"}` },
  });
  const actionLink = linkData?.properties?.action_link;
  if (actionLink) {
    await sendAccessEmail(opts.email, opts.fullName, actionLink, linkType).catch(err => {
      console.error("[offers/checkout] access email error:", err);
    });
  }

  return { userId, workspaceId: workspace.id };
}

async function sendAccessEmail(email: string, name: string, link: string, linkType: "invite" | "magiclink"): Promise<void> {
  if (!API_KEY) return; // Dev mode — no email transport configured

  const firstName = name.split(" ")[0];
  const heading = linkType === "invite" ? "You're invited to Leadash" : "Your Leadash account is ready";
  const cta = linkType === "invite" ? "Accept Invite & Set Password →" : "Go to Your Dashboard →";

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:#111;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:36px 32px">
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700">Hey ${firstName}, ${heading.toLowerCase()}!</h2>
        <p style="color:#6b7280;margin-top:4px">Your purchase is confirmed. Click below to access your account.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="display:inline-block;background:#f97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
            ${cta}
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px">This link is single-use. If it expires, request a new sign-in link at leadash.com/login.</p>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    `Leadash <${FROM_EMAIL}>`,
      to:      [email],
      subject: heading,
      html,
    }),
  });
}
