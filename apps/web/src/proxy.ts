import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/features",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/join",
  "/free-training",
  "/api/billing/webhook",
  "/api/billing/paystack",
  "/api/track",
  "/api/outreach/unsubscribe",
  "/api/outreach/inbound",
  "/api/auth/callback",
  "/api/auth/forgot-password",
  "/api/auth/signup",
  "/api/cron",
  "/api/beta",
  "/api/debug-currency",
  "/api/funnel",
  "/api/public",
  "/vendor/login",
  "/api/vendor/login",
  "/api/crm/inbound-whatsapp",
  "/api/crm/inbound-email",
  "/api/crm/inbound-instagram",
  "/api/crm/inbound-facebook",
  "/api/funnels/track",
  "/api/funnels/submit",
  "/f",
  "/o",
  "/api/offers",
];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/invite/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon");
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads the JWT from cookies — no network round-trip to Supabase.
  // getUser() (which hits the Supabase auth server) is used only for the admin
  // guard below where server-verified identity is security-critical.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;

  // ── Admin invite accept flow — always public ────────────────────────────────
  // The page + POST /api/admin/team/accept do their own auth (email of the
  // signed-in user must match the invite's email). If we ran the /admin guard
  // below, the invitee — who is not yet in the `admins` table by definition —
  // would be redirected to /dashboard, dragging their invite token along on
  // the URL (that was the reported symptom: /dashboard?token=…). Skip the
  // whole middleware stack for this route so the token survives and the page
  // can handle unauth via its own /login?redirect=<returnTo> bounce.
  if (pathname.startsWith("/admin/accept-invite")) {
    return supabaseResponse;
  }

  // ── Auth code on root — redirect to proper callback ──────────────────────────
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    return NextResponse.redirect(url);
  }

  // ── Vendor portal guard (cookie-based shared secret) ─────────────────────────
  if (pathname.startsWith("/vendor") && !pathname.startsWith("/vendor/login")) {
    const vendorToken = request.cookies.get("vendor_token")?.value;
    const expected    = process.env.VENDOR_PORTAL_SECRET;
    if (!expected || vendorToken !== expected) {
      const url = request.nextUrl.clone();
      url.pathname = "/vendor/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (pathname.startsWith("/api/vendor") && !pathname.startsWith("/api/vendor/login")) {
    const vendorToken = request.cookies.get("vendor_token")?.value;
    const expected    = process.env.VENDOR_PORTAL_SECRET;
    if (!expected || vendorToken !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  // ── Admin route guard (uses verified identity) ───────────────────────────────
  if (pathname.startsWith("/admin")) {
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (!verifiedUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    const adminClient = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: admin } = await adminClient
      .from("admins")
      .select("role")
      .eq("user_id", verifiedUser.id)
      .maybeSingle();

    if (!admin) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Redirect unauthenticated users away from app routes
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
