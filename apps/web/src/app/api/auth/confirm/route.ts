/**
 * GET /api/auth/confirm — token-hash verification endpoint for links we
 * generate server-side via admin.generateLink() (password recovery, and any
 * future email-change/invite links).
 *
 * Why this exists: generateLink() flows can't go through
 * /api/auth/callback's exchangeCodeForSession() — that requires a PKCE
 * code-verifier stored by the browser that STARTED the flow, and admin-
 * generated links never started in a browser. The exchange always failed
 * and users landed on /login?error=auth_callback_failed instead of the
 * reset page. verifyOtp({ token_hash }) is the server-side path that works
 * without a verifier (documented @supabase/ssr pattern).
 */
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type      = searchParams.get("type") as EmailOtpType | null;
  const nextRaw   = (searchParams.get("next") || "").trim();
  // Relative paths only — same open-redirect rule as /api/auth/callback.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  type PendingCookie = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };
  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const c of cookiesToSet) pendingCookies.push(c as PendingCookie);
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Expired or already-used link — send them somewhere they can recover
    // from rather than a dead end.
    const fallback = type === "recovery" ? "/forgot-password?error=link_expired" : "/login?error=link_expired";
    return NextResponse.redirect(`${origin}${fallback}`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  for (const c of pendingCookies) response.cookies.set(c.name, c.value, c.options);
  return response;
}
