import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const db = createAdminClient();

  // Look up affiliate by handle
  const { data: affiliate } = await db
    .from("affiliates")
    .select("id, clicks")
    .eq("handle", handle)
    .maybeSingle();

  const redirectUrl = new URL("/", req.url).toString();

  if (!affiliate) {
    return NextResponse.redirect(redirectUrl);
  }

  // Increment click count (fire and forget)
  db.from("affiliates")
    .update({ clicks: affiliate.clicks + 1 })
    .eq("id", affiliate.id)
    .then(() => {})
    .catch(() => {});

  // Set 30-day referral cookie and redirect to home
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set("ld_ref", affiliate.id, {
    maxAge: 30 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
