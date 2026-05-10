import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

/** POST /api/academy/discount-codes/validate
 *  Returns the discount amount for a given code + product. */
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db } = auth;

  let body: { code?: string; product_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { code, product_id } = body;
  if (!code || !product_id) return NextResponse.json({ error: "code and product_id required" }, { status: 400 });

  const { data: dc } = await db
    .from("academy_discount_codes")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .eq("is_active", true)
    .maybeSingle();

  if (!dc) return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });

  // Check product scope
  if (dc.product_id && dc.product_id !== product_id)
    return NextResponse.json({ error: "Code not valid for this product" }, { status: 400 });

  // Check expiry
  if (dc.expires_at && new Date(dc.expires_at) < new Date())
    return NextResponse.json({ error: "Code has expired" }, { status: 400 });

  // Check max uses
  if (dc.max_uses !== null && dc.uses_count >= dc.max_uses)
    return NextResponse.json({ error: "Code has reached max uses" }, { status: 400 });

  // Get product price
  const { data: product } = await db.from("academy_products").select("price_ngn").eq("id", product_id).single();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  let discountNgn = 0;
  if (dc.discount_type === "percent") {
    discountNgn = Math.round(product.price_ngn * dc.discount_value / 100);
  } else {
    discountNgn = dc.discount_value;
  }

  const finalNgn = Math.max(0, product.price_ngn - discountNgn);

  return NextResponse.json({
    valid: true,
    code_id:       dc.id,
    discount_type: dc.discount_type,
    discount_value: dc.discount_value,
    discount_ngn:  discountNgn,
    original_ngn:  product.price_ngn,
    final_ngn:     finalNgn,
  });
}
