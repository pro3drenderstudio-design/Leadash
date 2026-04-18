import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !user) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);

  const db = createAdminClient();

  // Check if this user already has a workspace membership
  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    // Returning user — go straight to dashboard
    response.headers.set("location", `${origin}/dashboard`);
    return response;
  }

  // New auth user — check if another account with the same email already has workspaces.
  // This happens when someone signed up with email/password then tries Google with the same email.
  const { data: { users: sameEmailUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
  const duplicate = sameEmailUsers?.find(
    (u: { id: string; email?: string }) => u.email === user.email && u.id !== user.id
  );

  if (duplicate) {
    const { data: existingMemberships } = await db
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", duplicate.id);

    if (existingMemberships?.length) {
      // Link this new Google identity to the existing user's workspaces
      await db.from("workspace_members").insert(
        existingMemberships.map(m => ({
          workspace_id: m.workspace_id,
          user_id:      user.id,
          role:         m.role,
        }))
      ).onConflict("workspace_id, user_id").ignore();

      response.headers.set("location", `${origin}/dashboard`);
      return response;
    }
  }

  // Genuinely new user — send to onboarding
  response.headers.set("location", `${origin}/onboarding`);
  return response;
}
