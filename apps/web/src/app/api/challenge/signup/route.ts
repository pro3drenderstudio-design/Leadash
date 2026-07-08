import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const WA_COMMUNITY_MANAGER = "2349110260332";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

// POST /api/challenge/signup
// Creates a Leadash account + challenge_signups record (bank transfer path)
// or records a Paystack reference (Paystack path).
// Returns { wa_url } — client redirects to WhatsApp DM.
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    full_name: string;
    email: string;
    phone: string;
    bank_account_name: string;
    password: string;
    payment_method?: "bank_transfer" | "paystack";
    paystack_reference?: string;
  };

  const { full_name, email, phone, bank_account_name, password, payment_method = "bank_transfer", paystack_reference } = body;

  if (!full_name || !email || !phone || !bank_account_name || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const db = createAdminClient();

  // Check for duplicate signup (same email, still pending)
  const { data: existing } = await db
    .from("challenge_signups")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  if (existing?.status === "confirmed") {
    return NextResponse.json({ error: "This email is already enrolled in the challenge. Check your inbox." }, { status: 409 });
  }

  // Create auth account (or get existing user)
  const { data: signUpData, error: signUpError } = await db.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,           // auto-confirm — we verify via WA payment confirmation
    user_metadata: { full_name, phone },
  });

  let userId: string;
  if (signUpError) {
    if (signUpError.message?.includes("already registered")) {
      // User exists — look them up
      const { data: users } = await db.auth.admin.listUsers();
      const found = users?.users?.find((u: { id: string; email?: string }) => u.email === email.toLowerCase().trim());
      if (!found) return NextResponse.json({ error: "Account already exists. Please log in instead." }, { status: 409 });
      userId = found.id;
    } else {
      return NextResponse.json({ error: signUpError.message }, { status: 500 });
    }
  } else {
    userId = signUpData.user.id;
    // Create workspace for new user
    const { error: wsError } = await db.from("workspaces").insert({
      id:            userId,
      name:          full_name.split(" ")[0] + "'s Workspace",
      billing_email: email.toLowerCase().trim(),
      plan_id:       "free",
      whatsapp_number: phone,
    });
    if (wsError) console.error("[challenge/signup] workspace create error:", wsError.message);
  }

  // Record the signup
  if (existing?.status === "pending") {
    // Update existing pending record
    await db.from("challenge_signups").update({
      full_name,
      phone,
      bank_account_name,
      payment_method,
      paystack_reference: paystack_reference ?? null,
      user_id: userId,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await db.from("challenge_signups").insert({
      full_name,
      email: email.toLowerCase().trim(),
      phone,
      bank_account_name,
      payment_method,
      paystack_reference: paystack_reference ?? null,
      user_id: userId,
      status: payment_method === "paystack" && paystack_reference ? "confirmed" : "pending",
    });
  }

  // Build prefilled WhatsApp DM to community manager
  const waMessage = encodeURIComponent(
    `Hi, my name is ${full_name}. I just paid ₦10,000 to join the 7-Day Job/Client Acquisition Challenge. Please confirm a payment from *${bank_account_name}* and grant me access. My email: ${email}`
  );
  const wa_url = `https://wa.me/${WA_COMMUNITY_MANAGER}?text=${waMessage}`;

  return NextResponse.json({
    ok: true,
    wa_url,
    redirect_url: `${APP_URL}/challenge/pending?email=${encodeURIComponent(email)}`,
  });
}
