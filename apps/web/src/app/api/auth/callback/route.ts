/**
 * GET /api/auth/callback — Supabase OAuth + magic-link return URL.
 *
 * Decides the post-login redirect target up-front, then builds the redirect
 * response exactly once. (Mutating `response.headers.set('location', ...)`
 * after `NextResponse.redirect()` is unreliable on Next.js 16 — the original
 * Location can stick — which was sending OAuth users to '/' when `?next=` was
 * empty. Doing it as a single construction sidesteps that whole class of bug.)
 *
 * Order of resolution for where the user lands:
 *   1. If they already have a workspace membership → /dashboard
 *   2. If their email matches an existing account → link this identity → /dashboard
 *   3. Otherwise (new user) → /onboarding (and fire welcome email)
 *   4. Anything goes wrong → /dashboard as a safe default (better than '/')
 */
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email/notifications";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Use `||` not `??` so empty-string `?next=` falls back to /onboarding too
  // (??' only treats null/undefined as missing, so "" would become the literal redirect target — i.e. bare "/").
  const explicitNext = (searchParams.get("next") || "").trim();

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // We need to set cookies on whatever response we end up returning. Capture
  // them in a pending list during the code exchange, then attach to the final
  // redirect once we know the target.
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

  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !user) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // Compute where to send the user, defaulting to /dashboard so we never strand
  // them at the marketing root.
  const target = await resolveRedirectTarget(user, explicitNext);

  // Build the redirect *once* and attach the session cookies to it.
  const response = NextResponse.redirect(`${origin}${target}`);
  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  return response;
}

/**
 * Walks the membership table to decide where this user belongs. Pure helper
 * so the main handler stays a clean read of the redirect contract.
 */
async function resolveRedirectTarget(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  explicitNext: string,
): Promise<string> {
  const db = createAdminClient();

  // If the caller passed an explicit `next=/some/path`, honor it (used by
  // impersonation, password reset, magic links). Only accept relative paths
  // starting with "/" so we can't be tricked into redirecting off-site.
  if (explicitNext && explicitNext.startsWith("/") && !explicitNext.startsWith("//")) {
    return explicitNext;
  }

  // 1. Returning user — has at least one workspace already
  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) return "/dashboard";

  // 2. New Google identity for an existing email/password user — link them
  //    into the existing user's workspaces so they don't start fresh.
  if (user.email) {
    try {
      const { data: { users: sameEmailUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
      const duplicate = sameEmailUsers?.find(
        (u: { id: string; email?: string }) => u.email === user.email && u.id !== user.id,
      );
      if (duplicate) {
        const { data: existingMemberships } = await db
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", duplicate.id);
        if (existingMemberships?.length) {
          // Correct supabase-js upsert syntax (the previous .onConflict(...).ignore()
          // chain was invalid and threw at runtime, breaking this whole path).
          await db.from("workspace_members").upsert(
            existingMemberships.map((m: { workspace_id: string; role: string }) => ({
              workspace_id: m.workspace_id,
              user_id:      user.id,
              role:         m.role,
            })),
            { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
          );
          return "/dashboard";
        }
      }
    } catch (e) {
      // Don't strand the user if the duplicate-link path fails — fall through
      // to the new-user flow and they'll go through onboarding instead.
      console.error("[auth/callback] duplicate link failed:", e);
    }
  }

  // 3. Genuinely new user — welcome email + onboarding
  if (user.email) {
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
    sendWelcomeEmail({ userEmail: user.email, userName: fullName })
      .catch(e => console.error("[auth/callback] welcome email failed:", e));
  }
  return "/onboarding";
}
