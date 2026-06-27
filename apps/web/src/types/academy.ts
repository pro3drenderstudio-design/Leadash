// ─── Core entities ────────────────────────────────────────────────────────────

export interface ChallengeConfig {
  tagline?: string;
  duration_days?: number;
  cadence?: "daily" | "weekly" | "custom";
  start_mode?: "fixed_cohort" | "rolling" | "enrollment" | "cohort";
  grace_days?: number;
  catchup_enabled?: boolean;
  leaderboard_enabled?: boolean;
  points_board_enabled?: boolean;
  earnings_board_enabled?: boolean;
  earnings_require_proof?: boolean;
  earnings_reset?: "all_time" | "weekly" | "daily";
  auto_advance_offer?: {
    enabled: boolean;
    trigger: string;
    window_hours: number;
    target_product_id?: string;
    discount_type: string;
    discount_value: number;
  };
  reminders?: {
    email: boolean;
    whatsapp: boolean;
    daily_unlock_time: string;
    timezone: string;
    nudge_missed: boolean;
  };
  [key: string]: unknown;
}

export interface AcademyProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  trailer_playback_id: string | null;
  sales_page_body: string | null;
  pricing_type: "free" | "one_time" | "subscription" | "cohort_only";
  price_ngn: number;
  compare_price_ngn: number | null;
  credits_grant: number;
  leadash_months: number;
  certificate_enabled: boolean;
  completion_threshold_pct: number;
  is_active: boolean;
  is_published: boolean;
  created_at: string;
  product_type: "course" | "challenge";
  challenge_config: ChallengeConfig | null;
  challenge_winners: Array<{ rank: number; enrollment_id: string; awarded_at: string }> | null;
}

export type AcademyChallengeTaskType = "lesson" | "proof" | "self_check" | "metric" | "live" | "quiz";

export interface AcademyChallengeTask {
  id: string;
  product_id: string;
  day: number;
  position: number;
  task_type: AcademyChallengeTaskType;
  title: string;
  points: number;
  lesson_id: string | null;
  proof_config: { accepts: string[]; prompt: string } | null;
  metric_config: { source: "leadash_outbox" | "manual"; metric: string; target: number } | null;
  live_session_id: string | null;
  quiz_config: Record<string, unknown> | null;
  is_published: boolean;
  created_at: string;
}

export interface AcademyChallengeCompletion {
  id: string;
  enrollment_id: string;
  task_id: string;
  product_id: string;
  day: number;
  status: "completed" | "skipped";
  proof_files: { url: string; name: string; type: string }[] | null;
  proof_text: string | null;
  metric_value: number | null;
  points_awarded: number;
  completed_at: string;
}

export interface AcademySection {
  id: string;
  product_id: string;
  title: string;
  description: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
}

export type LessonType = "video" | "text" | "quiz" | "live" | "assignment";
export type DripType =
  | "immediate"
  | "days_after_enrollment"
  | "days_after_cohort_start"
  | "on_date"
  | "manual";

export interface AcademyLesson {
  id: string;
  section_id: string;
  product_id: string;
  title: string;
  description: string | null;
  lesson_type: LessonType;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_upload_id: string | null;
  duration_secs: number | null;
  thumbnail_url: string | null;
  content_json: Record<string, unknown> | null;
  attachments: { name: string; url: string; size: number }[];
  position: number;
  drip_type: DripType;
  drip_value: number | null;
  drip_date: string | null;
  is_free_preview: boolean;
  is_published: boolean;
  created_at: string;
}

export interface AcademyCohort {
  id: string;
  product_id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  max_seats: number | null;
  enrolled_count: number;
  status: "draft" | "upcoming" | "active" | "ended";
  is_default: boolean;
  welcome_message: string | null;
  created_at: string;
}

export interface AcademyEnrollment {
  id: string;
  user_id: string;
  workspace_id: string;
  product_id: string;
  cohort_id: string | null;
  status: "active" | "completed" | "cancelled";
  access_type: "paid" | "free" | "gifted" | "admin_granted" | "scholarship";
  paystack_reference: string | null;
  amount_kobo: number | null;
  original_amount_kobo: number | null;
  discount_code_id: string | null;
  phone: string | null;
  whatsapp_opted_in: boolean;
  affiliate_code: string | null;
  credits_granted: boolean;
  leadash_access_ends_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export interface AcademyLessonProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  status: "started" | "completed";
  watch_percent: number;
  watch_time_secs: number;
  last_watched_at: string | null;
  completed_at: string | null;
}

export interface AcademyCertificate {
  id: string;
  enrollment_id: string;
  user_id: string;
  product_id: string;
  certificate_number: string;
  pdf_url: string | null;
  issued_at: string;
}

export interface AcademyDiscountCode {
  id: string;
  code: string;
  product_id: string | null;
  discount_type: "percent" | "fixed_ngn";
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AcademyComment {
  id: string;
  lesson_id: string;
  enrollment_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  is_pinned: boolean;
  is_resolved: boolean;
  like_count: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_avatar?: string | null;
  replies?: AcademyComment[];
}

export interface AcademyNote {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  user_id: string;
  body: string;
  updated_at: string;
}

export interface AcademyLiveSession {
  id: string;
  lesson_id: string;
  scheduled_at: string;
  duration_mins: number;
  platform: "zoom" | "meet" | "custom";
  host_url: string | null;
  join_url: string;
  recording_playback_id: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface AcademyAssignment {
  id: string;
  lesson_id: string;
  instructions: string;
  due_offset_hours: number | null;
  max_file_size_mb: number;
  allowed_types: string[];
  created_at: string;
}

export interface AcademyAssignmentSubmission {
  id: string;
  lesson_id: string;
  enrollment_id: string;
  user_id: string;
  files: { name: string; url: string; size: number }[];
  text_response: string | null;
  status: "submitted" | "reviewed" | "approved" | "needs_revision";
  admin_feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface AcademyGamification {
  id: string;
  enrollment_id: string;
  user_id: string;
  product_id: string;
  points: number;
  streak_days: number;
  last_active_date: string | null;
  badges: string[];
  reported_earnings_cents: number;
  earnings_proof_url: string | null;
  earnings_verified: boolean;
  grace_days_used: number;
}

// ─── Composite / view types ───────────────────────────────────────────────────

export interface SectionWithLessons extends AcademySection {
  lessons: LessonWithState[];
}

export interface LessonWithState extends AcademyLesson {
  unlocked: boolean;
  completed: boolean;
  progress: AcademyLessonProgress | null;
}

export interface ProductWithEnrollment extends AcademyProduct {
  enrollment: AcademyEnrollment | null;
  cohort: AcademyCohort | null;
  sections: SectionWithLessons[];
  completed_count: number;
  total_lessons: number;
  certificate: AcademyCertificate | null;
}

// ─── Unlock logic (pure — runs on server and client) ─────────────────────────

export function isLessonUnlocked(
  lesson: AcademyLesson,
  enrollment: AcademyEnrollment,
  cohort: AcademyCohort | null
): boolean {
  if (lesson.is_free_preview) return true;
  const now = Date.now();
  switch (lesson.drip_type) {
    case "immediate":
      return true;
    case "days_after_enrollment": {
      const days = lesson.drip_value ?? 0;
      return now >= new Date(enrollment.enrolled_at).getTime() + days * 86_400_000;
    }
    case "days_after_cohort_start": {
      if (!cohort) return true;
      const days = lesson.drip_value ?? 0;
      return now >= new Date(cohort.starts_at).getTime() + days * 86_400_000;
    }
    case "on_date":
      return lesson.drip_date ? now >= new Date(lesson.drip_date).getTime() : false;
    case "manual":
      return false;
    default:
      return true;
  }
}

export function formatNgn(naira: number): string {
  return `₦${naira.toLocaleString("en-NG")}`;
}

export function lessonDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
