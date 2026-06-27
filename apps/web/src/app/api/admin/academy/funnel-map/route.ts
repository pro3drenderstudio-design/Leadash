import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  product_type: string;
  pricing_type: string;
  price_ngn: number;
  is_active: boolean;
  is_published: boolean;
}

interface EnrollmentRow {
  product_id: string;
  amount_kobo: number | null;
  status: string;
}

/** GET /api/admin/academy/funnel-map
 *  Returns funnel stages derived from academy_products ordered by price_ngn ascending,
 *  with enrollment counts and revenue. Includes a totals object. */
export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch all active products ordered by price ascending
  const { data: products, error: productsError } = await db
    .from("academy_products")
    .select("id, slug, name, product_type, pricing_type, price_ngn, is_active, is_published")
    .eq("is_active", true)
    .order("price_ngn", { ascending: true });

  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  const productRows = (products ?? []) as ProductRow[];
  if (productRows.length === 0) {
    return NextResponse.json({ stages: [], totals: { total_revenue_ngn: 0, paid_enrollments: 0 } });
  }

  const productIds = productRows.map((p) => p.id);

  // Fetch all enrollments for these products (excluding cancelled)
  const { data: enrollments, error: enrollmentError } = await db
    .from("academy_enrollments")
    .select("product_id, amount_kobo, status")
    .in("product_id", productIds)
    .neq("status", "cancelled");

  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 500 });

  const enrollmentRows = (enrollments ?? []) as EnrollmentRow[];

  // Aggregate per product
  const enrolledByProduct = new Map<string, number>();
  const revenueByProduct = new Map<string, number>();

  for (const enr of enrollmentRows) {
    enrolledByProduct.set(enr.product_id, (enrolledByProduct.get(enr.product_id) ?? 0) + 1);
    if (enr.amount_kobo && enr.amount_kobo > 0) {
      // amount_kobo → kobo → NGN (divide by 100)
      revenueByProduct.set(
        enr.product_id,
        (revenueByProduct.get(enr.product_id) ?? 0) + Math.round(enr.amount_kobo / 100)
      );
    }
  }

  const stages = productRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    product_type: p.product_type ?? "course",
    pricing_type: p.pricing_type,
    price_ngn: p.price_ngn,
    is_published: p.is_published,
    enrolled: enrolledByProduct.get(p.id) ?? 0,
    revenue_ngn: revenueByProduct.get(p.id) ?? 0,
  }));

  // Totals across all products
  let totalRevenueNgn = 0;
  let paidEnrollments = 0;
  for (const enr of enrollmentRows) {
    if (enr.amount_kobo && enr.amount_kobo > 0) {
      totalRevenueNgn += Math.round(enr.amount_kobo / 100);
      paidEnrollments++;
    }
  }

  return NextResponse.json({
    stages,
    totals: {
      total_revenue_ngn: totalRevenueNgn,
      paid_enrollments: paidEnrollments,
    },
  });
}
