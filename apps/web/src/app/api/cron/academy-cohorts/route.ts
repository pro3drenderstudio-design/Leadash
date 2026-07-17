/**
 * GET /api/cron/academy-cohorts  (hourly)
 *
 * Weekly cohort lifecycle for cohort-based challenges. Delegates to the
 * run_cohort_scheduler() Postgres function which — idempotently — opens the next
 * enrolling cohort (Mon 00:00 WAT), rolls it live the following Mon 21:00 WAT,
 * transitions cohort status by wall clock, and stamps a provisional winner when
 * a cohort ends. This route just invokes it and notifies admins of any new
 * winner (prizes are granted only after an admin confirms — see admin UI).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("run_cohort_scheduler");
  if (error) {
    console.error("[cron/academy-cohorts] scheduler error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (data ?? { created: 0, winners: [] }) as {
    created: number;
    winners: Array<{ cohort_id: string; enrollment_id: string; points: number }>;
  };

  // Notify admins of any freshly-selected provisional winners (manual confirm + payout).
  const adminEmail = process.env.CRM_SUPPORT_EMAIL;
  const resendKey  = process.env.RESEND_API_KEY;
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? "academy@leadash.com";
  if (result.winners.length > 0 && adminEmail && resendKey) {
    for (const w of result.winners) {
      try {
        const { data: enr } = await db
          .from("academy_enrollments")
          .select("user_id, phone, workspace_id")
          .eq("id", w.enrollment_id)
          .maybeSingle();
        const { data: cohort } = await db
          .from("academy_cohorts")
          .select("name").eq("id", w.cohort_id).maybeSingle();
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `Leadash Academy <${fromEmail}>`,
            to: [adminEmail],
            subject: `🏆 Cohort winner ready to confirm — ${cohort?.name ?? w.cohort_id}`,
            html: `<p>A cohort just ended and a provisional winner was selected.</p>
<ul>
  <li><strong>Cohort:</strong> ${cohort?.name ?? w.cohort_id}</li>
  <li><strong>Winner enrollment:</strong> ${w.enrollment_id}</li>
  <li><strong>Points:</strong> ${w.points}</li>
</ul>
<p>Confirm the winner in the admin challenge dashboard to grant the $10k Academy and mark the ₦50,000 cash prize for payout.</p>`,
          }),
        });
      } catch (e) {
        console.error("[cron/academy-cohorts] winner notify error:", e);
      }
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
