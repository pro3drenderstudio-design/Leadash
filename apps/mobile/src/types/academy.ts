/**
 * Academy types — slim mobile port of apps/web/src/types/academy.ts, shaped
 * to what the /api/academy/* endpoints actually return to the app.
 */

export interface AcademyEnrollment {
  id: string;
  product_id: string;
  cohort_id: string | null;
  status: "active" | "completed" | "cancelled";
  enrolled_at: string;
  completed_at: string | null;
}

export interface AcademyCohort {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
}

export interface AcademyLessonRow {
  id: string;
  section_id: string;
  product_id: string;
  title: string;
  description: string | null;
  lesson_type: "video" | "text" | "quiz" | "live" | "assignment";
  mux_playback_id: string | null;
  duration_secs: number | null;
  is_free_preview: boolean;
  position: number;
  // annotated by the API:
  unlocked: boolean;
  completed: boolean;
}

export interface AcademySectionRow {
  id: string;
  product_id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: AcademyLessonRow[];
}

export interface ChallengeConfig {
  duration_days?: number;
  start_mode?: string;
  [key: string]: unknown;
}

export interface AcademyProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  pricing_type: "free" | "one_time" | "subscription" | "cohort_only";
  price_ngn: number;
  product_type: "course" | "challenge";
  challenge_config: ChallengeConfig | null;
  // annotated by /api/academy/products:
  enrollment: AcademyEnrollment | null;
  cohort: AcademyCohort | null;
  sections: AcademySectionRow[];
  total_lessons: number;
  completed_count: number;
}

export type ChallengeTaskType = "lesson" | "proof" | "self_check" | "metric" | "live" | "quiz";

export interface ChallengeCompletion {
  task_id: string;
  day: number;
  status: string;
  points_awarded: number;
  completed_at: string;
  metric_value: number | null;
  proof_text: string | null;
}

export interface ChallengeTaskRow {
  id: string;
  day: number;
  position: number;
  task_type: ChallengeTaskType;
  title: string;
  points: number;
  lesson_id: string | null;
  proof_config: { accepts: string[]; prompt: string } | null;
  metric_config: { source: "leadash_outbox" | "manual"; metric: string; target: number } | null;
  // annotated by the API:
  unlocked: boolean;
  completed: boolean;
  completion: ChallengeCompletion | null;
}

export interface ChallengePayload {
  product: AcademyProductRow & { challenge_config: ChallengeConfig | null };
  enrollment: AcademyEnrollment | null;
  cohort: AcademyCohort | null;
  gamification: { points: number; streak_days: number; reported_earnings_cents: number } | null;
  tasks: ChallengeTaskRow[];
  days_completed: number[];
  offer_unlocked: boolean;
}

export interface LeaderboardRow {
  rank: number;
  enrollment_id: string;
  workspace_name: string;
  streak_days: number;
  points: number;
  is_me: boolean;
  graduated: boolean;
}

export interface LessonContentBlock {
  id: string;
  position: number;
  block_type: string;
  content: Record<string, unknown> | string | null;
}

export interface LessonResource {
  id: string;
  position: number;
  resource_type: string;
  label: string;
  description: string | null;
  url: string;
}
