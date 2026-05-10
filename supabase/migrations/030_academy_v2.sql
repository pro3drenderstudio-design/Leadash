-- =============================================================
-- Academy v2: Full LMS upgrade
-- Adds: sections, lessons (drip), lesson_progress, certificates,
--        discount_codes, comments, notes, live_sessions,
--        assignments, assignment_submissions, gamification
-- Enhances: academy_products, academy_cohorts, academy_enrollments
-- Migrates: academy_modules → academy_sections + academy_lessons
--           academy_progress → academy_lesson_progress
-- =============================================================

-- ── 1. Discount codes (created first — enrollments FK depends on it) ──────
CREATE TABLE IF NOT EXISTS academy_discount_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL,
  product_id     text REFERENCES academy_products(id) ON DELETE CASCADE,
  discount_type  text NOT NULL CHECK (discount_type IN ('percent','fixed_ngn')),
  discount_value int  NOT NULL CHECK (discount_value > 0),
  max_uses       int,
  uses_count     int  NOT NULL DEFAULT 0,
  valid_from     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (code)
);

ALTER TABLE academy_discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discount_codes_public_read"  ON academy_discount_codes FOR SELECT USING (is_active = true);
CREATE POLICY "discount_codes_admin_all"    ON academy_discount_codes USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 2. Enhance academy_products ───────────────────────────────────────────
ALTER TABLE academy_products
  ADD COLUMN IF NOT EXISTS slug                   text,
  ADD COLUMN IF NOT EXISTS thumbnail_url          text,
  ADD COLUMN IF NOT EXISTS trailer_playback_id    text,
  ADD COLUMN IF NOT EXISTS sales_page_body        text,
  ADD COLUMN IF NOT EXISTS pricing_type           text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS compare_price_ngn      int,
  ADD COLUMN IF NOT EXISTS certificate_enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS completion_threshold_pct int NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS is_published           boolean NOT NULL DEFAULT true;

-- Backfill slug from id for existing products
UPDATE academy_products SET slug = id WHERE slug IS NULL;
ALTER TABLE academy_products ADD CONSTRAINT academy_products_slug_unique UNIQUE (slug);

-- ── 3. Enhance academy_cohorts ────────────────────────────────────────────
ALTER TABLE academy_cohorts
  ADD COLUMN IF NOT EXISTS ends_at         timestamptz,
  ADD COLUMN IF NOT EXISTS is_default      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrolled_count  int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_message text;

-- ── 4. Enhance academy_enrollments ───────────────────────────────────────
ALTER TABLE academy_enrollments
  ADD COLUMN IF NOT EXISTS access_type          text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS discount_code_id     uuid REFERENCES academy_discount_codes(id),
  ADD COLUMN IF NOT EXISTS original_amount_kobo int,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliate_code       text;

-- ── 5. Sections (chapters within a course) ───────────────────────────────
CREATE TABLE IF NOT EXISTS academy_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  text NOT NULL REFERENCES academy_products(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  position    int  NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE academy_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_public_read" ON academy_sections FOR SELECT USING (true);
CREATE POLICY "sections_admin_all"   ON academy_sections USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 6. Lessons (replaces flat academy_modules) ───────────────────────────
CREATE TABLE IF NOT EXISTS academy_lessons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      uuid NOT NULL REFERENCES academy_sections(id) ON DELETE CASCADE,
  product_id      text NOT NULL REFERENCES academy_products(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  lesson_type     text NOT NULL DEFAULT 'video'
                  CHECK (lesson_type IN ('video','text','quiz','live','assignment')),
  mux_asset_id    text,
  mux_playback_id text,
  mux_upload_id   text,
  duration_secs   int,
  thumbnail_url   text,
  content_json    jsonb,
  attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  position        int   NOT NULL DEFAULT 0,
  drip_type       text  NOT NULL DEFAULT 'immediate'
                  CHECK (drip_type IN ('immediate','days_after_enrollment','days_after_cohort_start','on_date','manual')),
  drip_value      int,
  drip_date       timestamptz,
  is_free_preview boolean NOT NULL DEFAULT false,
  is_published    boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_lessons_section_idx    ON academy_lessons (section_id);
CREATE INDEX IF NOT EXISTS academy_lessons_product_idx    ON academy_lessons (product_id);

ALTER TABLE academy_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_public_read" ON academy_lessons FOR SELECT USING (true);
CREATE POLICY "lessons_admin_all"   ON academy_lessons USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 7. Lesson progress (replaces academy_progress) ───────────────────────
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES academy_lessons(id)     ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'started'
                  CHECK (status IN ('started','completed')),
  watch_percent   int  NOT NULL DEFAULT 0,
  watch_time_secs int  NOT NULL DEFAULT 0,
  last_watched_at timestamptz,
  completed_at    timestamptz,
  UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_progress_enrollment_idx ON academy_lesson_progress (enrollment_id);

ALTER TABLE academy_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_progress_own" ON academy_lesson_progress
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM academy_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
  );

-- ── 8. Certificates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_certificates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id      uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id         text NOT NULL REFERENCES academy_products(id),
  certificate_number text NOT NULL,
  pdf_url            text,
  issued_at          timestamptz DEFAULT now(),
  UNIQUE (certificate_number),
  UNIQUE (enrollment_id)
);

ALTER TABLE academy_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificates_own"       ON academy_certificates FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "certificates_admin_all" ON academy_certificates USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 9. Comments / Q&A per lesson ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid NOT NULL REFERENCES academy_lessons(id)     ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  parent_id     uuid REFERENCES academy_comments(id)             ON DELETE CASCADE,
  body          text NOT NULL,
  is_pinned     boolean NOT NULL DEFAULT false,
  is_resolved   boolean NOT NULL DEFAULT false,
  like_count    int     NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_lesson_idx ON academy_comments (lesson_id);

ALTER TABLE academy_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_enrolled_read" ON academy_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academy_lessons l
      JOIN academy_enrollments e ON e.product_id = l.product_id
      WHERE l.id = lesson_id AND e.user_id = auth.uid() AND e.status = 'active'
    )
  );
CREATE POLICY "comments_own_write" ON academy_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_own_update" ON academy_comments FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "comments_admin_all" ON academy_comments USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 10. Student notes (private, per lesson) ───────────────────────────────
CREATE TABLE IF NOT EXISTS academy_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  lesson_id     uuid NOT NULL REFERENCES academy_lessons(id)     ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  body          text NOT NULL DEFAULT '',
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);

ALTER TABLE academy_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_own" ON academy_notes
  FOR ALL USING (user_id = auth.uid());

-- ── 11. Live sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_live_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id             uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  scheduled_at          timestamptz NOT NULL,
  duration_mins         int  NOT NULL DEFAULT 60,
  platform              text NOT NULL DEFAULT 'zoom'
                        CHECK (platform IN ('zoom','meet','custom')),
  host_url              text,
  join_url              text NOT NULL,
  recording_playback_id text,
  reminder_sent_at      timestamptz,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE academy_live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_sessions_enrolled_read" ON academy_live_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academy_lessons l
      JOIN academy_enrollments e ON e.product_id = l.product_id
      WHERE l.id = lesson_id AND e.user_id = auth.uid() AND e.status = 'active'
    )
  );
CREATE POLICY "live_sessions_admin_all" ON academy_live_sessions USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 12. Assignments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  instructions     text NOT NULL,
  due_offset_hours int,
  max_file_size_mb int  NOT NULL DEFAULT 10,
  allowed_types    jsonb NOT NULL DEFAULT '["pdf","doc","docx","jpg","png"]'::jsonb,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (lesson_id)
);

ALTER TABLE academy_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments_enrolled_read" ON academy_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academy_lessons l
      JOIN academy_enrollments e ON e.product_id = l.product_id
      WHERE l.id = lesson_id AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "assignments_admin_all" ON academy_assignments USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 13. Assignment submissions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_assignment_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid NOT NULL REFERENCES academy_lessons(id)     ON DELETE CASCADE,
  enrollment_id  uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  files          jsonb NOT NULL DEFAULT '[]'::jsonb,
  text_response  text,
  status         text NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted','reviewed','approved','needs_revision')),
  admin_feedback text,
  submitted_at   timestamptz DEFAULT now(),
  reviewed_at    timestamptz,
  UNIQUE (enrollment_id, lesson_id)
);

ALTER TABLE academy_assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_own"       ON academy_assignment_submissions
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "submissions_admin_all" ON academy_assignment_submissions USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 14. Gamification (points, streaks, badges per enrollment) ─────────────
CREATE TABLE IF NOT EXISTS academy_gamification (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id       text NOT NULL REFERENCES academy_products(id),
  points           int  NOT NULL DEFAULT 0,
  streak_days      int  NOT NULL DEFAULT 0,
  last_active_date date,
  badges           jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (enrollment_id)
);

ALTER TABLE academy_gamification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gamification_own"       ON academy_gamification FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "gamification_admin_all" ON academy_gamification USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- ── 15. Data migration: academy_modules → sections + lessons ─────────────

-- Create one default section per product from existing modules
INSERT INTO academy_sections (id, product_id, title, position, is_published)
SELECT
  gen_random_uuid(),
  p.id,
  'Course Content',
  0,
  true
FROM academy_products p
WHERE EXISTS (SELECT 1 FROM academy_modules m WHERE m.product_id = p.id)
ON CONFLICT DO NOTHING;

-- Migrate modules to lessons (linked to the default section)
INSERT INTO academy_lessons (
  id, section_id, product_id, title, description,
  lesson_type, mux_asset_id, mux_playback_id, duration_secs,
  position, drip_type, drip_value, is_free_preview, is_published, created_at
)
SELECT
  gen_random_uuid(),
  s.id,
  m.product_id,
  m.title,
  m.description,
  'video',
  m.mux_asset_id,
  m.mux_playback_id,
  m.duration_secs,
  m.day_number,
  CASE
    WHEN m.unlock_offset_hours = 0 THEN 'immediate'
    ELSE 'days_after_cohort_start'
  END,
  CASE
    WHEN m.unlock_offset_hours > 0 THEN m.unlock_offset_hours / 24
    ELSE NULL
  END,
  m.day_number = 1,  -- first lesson is free preview
  true,
  m.created_at
FROM academy_modules m
JOIN academy_sections s ON s.product_id = m.product_id AND s.title = 'Course Content'
ON CONFLICT DO NOTHING;

-- Migrate existing progress records
INSERT INTO academy_lesson_progress (enrollment_id, lesson_id, status, completed_at)
SELECT
  p.enrollment_id,
  l.id,
  'completed',
  p.completed_at
FROM academy_progress p
JOIN academy_modules m  ON m.id = p.module_id
JOIN academy_lessons  l ON l.product_id = m.product_id AND l.position = m.day_number
ON CONFLICT (enrollment_id, lesson_id) DO NOTHING;

-- Seed gamification rows for existing enrollments
INSERT INTO academy_gamification (enrollment_id, user_id, product_id)
SELECT e.id, e.user_id, e.product_id
FROM academy_enrollments e
ON CONFLICT (enrollment_id) DO NOTHING;
