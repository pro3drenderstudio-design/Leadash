import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";
import { createPaystackCheckout } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId, userId } = auth;

  let body: { product_id?: string; cohort_id?: string; phone?: string; callback_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_id, cohort_id, phone, callback_url } = body;
  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  if (!callback_url) return NextResponse.json({ error: "callback_url required" }, { status: 400 });

  const { data: product } = await db
    .from("academy_products")
    .select("*")
    .eq("id", product_id)
    .eq("is_active", true)
    .single();

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data: existing } = await db
    .from("academy_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", product_id)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Already enrolled" }, { status: 409 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { authorizationUrl, reference } = await createPaystackCheckout({
    email,
    amountKobo: product.price_ngn * 100,
    callbackUrl: callback_url,
    metadata: {
      type:         "academy_enrollment",
      workspace_id: workspaceId,
      user_id:      userId,
      product_id,
      ...(cohort_id ? { cohort_id } : {}),
      ...(phone     ? { phone }     : {}),
    },
  });

  return NextResponse.json({ url: authorizationUrl, reference });
}
