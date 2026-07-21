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
  "/challenge",
  "/api/challenge",
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
  "/go",
  "/whatsapp_send",
  "/api/offers",
];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/invite/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    // Crawler-facing artefacts. Google Search Console fetches /sitemap.xml
    // and /robots.txt without cookies; if the auth guard redirects them to
    // /login, GSC reports "Sitemap is HTML" and drops indexing. Also expose
    // Apple/Android app-association files that OAuth/deep-link handshakes
    // rely on being served unauthenticated at the root.
    path === "/sitemap.xml" ||
    path === "/robots.txt" ||
    path === "/manifest.webmanifest" ||
    path === "/manifest.json" ||
    path === "/.well-known/apple-app-site-association" ||
    path.startsWith("/.well-known/");
}

// ── Redirect-loop circuit breaker ────────────────────────────────────────
// A stale or partially-corrupted auth cookie (e.g. left over from a bug
// that has since been fixed, or a multi-chunk @supabase/ssr cookie where
// one chunk didn't clear) can make getSession() flip-flop between
// "logged in" and "logged out" across the SAME redirect chain, which
// bounces the browser between /login ↔ /dashboard ↔ /reset-password
// forever — ERR_TOO_MANY_REDIRECTS, unrecoverable without the user
// manually clearing cookies. This guard counts consecutive
// middleware-issued redirects via a short-lived cookie; if too many stack
// up within a few seconds (a real redirect chain never needs more than
// 2-3 hops), it force-clears every Supabase auth cookie and sends the
// user to a clean /login instead of redirecting again. Worst case: the
// user has to sign back in. That's always recoverable, unlike the loop.
const REDIRECT_GUARD_COOKIE = "ld_rc";
const REDIRECT_GUARD_MAX    = 4;

function guardedRedirect(request: NextRequest, target: URL): NextResponse {
  const count = parseInt(request.cookies.get(REDIRECT_GUARD_COOKIE)?.value ?? "0", 10) || 0;

  if (count >= REDIRECT_GUARD_MAX) {
    // Break the loop: wipe every sb-* auth cookie and land on a clean
    // /login. No ?redirect= param — we don't trust anything about the
    // current chain enough to preserve it.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("recovered", "1");
    const res = NextResponse.redirect(loginUrl);
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") || c.name === REDIRECT_GUARD_COOKIE) {
        res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
      }
    }
    return res;
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(REDIRECT_GUARD_COOKIE, String(count + 1), { maxAge: 8, path: "/" });
  return res;
}

export async function middleware(request: NextRequest) {
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
  // Both the page AND the endpoint it fetches must be exempt from every
  // middleware rule:
  //
  //   • /admin/accept-invite — if we ran the /admin guard below, an invitee
  //     (not yet in `admins`) would be redirected to /dashboard with the
  //     invite token dragged along on the URL (the original reported bug).
  //
  //   • /api/admin/team/accept — an UNAUTH'd request would otherwise hit the
  //     "redirect unauthenticated users away from app routes" block further
  //     down and get a 307 to /login. The client fetch follows the redirect
  //     by default, tries res.json() on the returned login HTML, throws, and
  //     the page shows "Network error. Please try again." — hiding the real
  //     401 the route handler would have returned. The route handler already
  //     performs proper auth (401 when signed-out, 403 when the invite's
  //     email doesn't match the signed-in user, 400 when expired / used), so
  //     bypassing middleware here doesn't loosen any security.
  if (
    pathname.startsWith("/admin/accept-invite") ||
    pathname === "/api/admin/team/accept" ||
    pathname === "/api/admin/team/invite-check"
  ) {
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

  // API requests carrying a Bearer token (mobile app) skip the cookie-based
  // login redirect — every API route does its own auth via requireWorkspace/
  // requireUser, which validates the token against the Supabase auth server.
  if (pathname.startsWith("/api/") && request.headers.get("authorization")?.startsWith("Bearer ")) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users away from app routes
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return guardedRedirect(request, url);
  }

  // Redirect authenticated users away from auth pages. Check the reset gate
  // FIRST so a must-change-password user goes straight from /login to
  // /reset-password in one hop instead of bouncing through /dashboard —
  // fewer hops means less chance of ever tripping the loop guard for a
  // legitimate multi-step navigation.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const mustChange = (user.user_metadata as Record<string, unknown> | null)?.must_change_password === true;
    const url = request.nextUrl.clone();
    url.pathname = mustChange ? "/reset-password" : "/dashboard";
    if (mustChange) url.searchParams.set("reason", "first_login");
    return guardedRedirect(request, url);
  }

  // ── First-login forced password reset ──────────────────────────────────
  // Users created by an admin (POST /api/admin/users) or reset by an admin
  // (PATCH action=reset_password) carry user_metadata.must_change_password
  // until they set a fresh password. Gate ALL app routes behind
  // /reset-password until the flag clears. Auth flow endpoints, the reset
  // page itself, the API that clears the flag, and logout must stay
  // reachable or the user has no way to comply.
  if (
    user
    && (user.user_metadata as Record<string, unknown> | null)?.must_change_password === true
    && pathname !== "/reset-password"
    && pathname !== "/forgot-password"
    && pathname !== "/logout"
    && !pathname.startsWith("/api/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/reset-password";
    url.searchParams.set("reason", "first_login");
    return guardedRedirect(request, url);
  }

  // Any non-redirect response clears the loop-guard counter so it never
  // accumulates across unrelated, legitimately-separate navigations.
  supabaseResponse.cookies.set(REDIRECT_GUARD_COOKIE, "", { maxAge: 0, path: "/" });
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
