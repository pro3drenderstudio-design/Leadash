import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;

  // Use req.nextUrl.origin so the redirect target is always the public-facing
  // domain (e.g. https://leadash.com), not an internal Next.js/Vercel URL.
  const origin = req.nextUrl.origin;
  const redirectUrl = `${origin}/`;

  try {
    const db = createAdminClient();

    const { data: affiliate } = await db
      .from("affiliates")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();

    if (!affiliate) {
      return NextResponse.redirect(redirectUrl);
    }

    // Atomic increment — awaited so serverless doesn't terminate before it completes.
    await db.rpc("increment_affiliate_clicks", { aff_id: affiliate.id });

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("ld_ref", affiliate.id, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(redirectUrl);
  }
}
