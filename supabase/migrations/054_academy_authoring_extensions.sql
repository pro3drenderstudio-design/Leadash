-- ── 054: Academy authoring extensions ────────────────────────────────────────
-- Phase B brief items (d), (e), (f), (g):
--   (d) Per-course banner + optional CTA on the course landing page
--   (e) Per-section AND per-lesson CTA pinned inside the curriculum
--   (f) Ordered rich text blocks under each lesson's video
--   (g) Structured resource manager (files + external links) per lesson
--
-- We layer onto the existing academy_v2 schema rather than rewriting it.
-- The existing `academy_sections` table plays the "module" role; making
-- modules optional just means courses can have a single default section.
-- `attachments jsonb` on academy_lessons stays for back-compat — the new
-- resources table is the supported path for everything authored from now on.

-- ── 1. Per-course banner + CTA ───────────────────────────────────────────────
ALTER TABLE academy_products
  ADD COLUMN IF NOT EXISTS banner_image_url   text,
  ADD COLUMN IF NOT EXISTS banner_headline    text,
  ADD COLUMN IF NOT EXISTS banner_sub         text,
  ADD COLUMN IF NOT EXISTS banner_cta_text    text,
  ADD COLUMN IF NOT EXISTS banner_cta_url     text;

-- ── 2. Per-section CTA (modules are sections) ───────────────────────────────
ALTER TABLE academy_sections
  ADD COLUMN IF NOT EXISTS cta_text  text,
  ADD COLUMN IF NOT EXISTS cta_url   text;

-- ── 3. Per-lesson CTA ───────────────────────────────────────────────────────
ALTER TABLE academy_lessons
  ADD COLUMN IF NOT EXISTS cta_text  text,
  ADD COLUMN IF NOT EXISTS cta_url   text;

-- ── 4. Lesson text blocks (rich text under the video) ───────────────────────
-- Each block is an ordered chunk authored in Tiptap (HTML). Multiple blocks
-- per lesson lets authors interleave headings, paragraphs, code, callouts.
CREATE TABLE IF NOT EXISTS academy_lesson_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  position    int  NOT NULL DEFAULT 0,
  -- 'rich_text' = Tiptap HTML, 'callout' = highlighted note, 'code' = mono pre.
  block_type  text NOT NULL DEFAULT 'rich_text'
              CHECK (block_type IN ('rich_text','callout','code')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_lesson_blocks_lesson_idx
  ON academy_lesson_blocks (lesson_id, position);

ALTER TABLE academy_lesson_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lesson_blocks_public_read" ON academy_lesson_blocks;
CREATE POLICY "lesson_blocks_public_read"
  ON academy_lesson_blocks FOR SELECT USING (true);
DROP POLICY IF EXISTS "lesson_blocks_admin_all" ON academy_lesson_blocks;
CREATE POLICY "lesson_blocks_admin_all"
  ON academy_lesson_blocks USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
  );

-- ── 5. Lesson resources (downloads, links, supplementary files) ─────────────
-- 'file' resources point at Supabase Storage objects. 'link' resources are
-- external URLs (templates in Google Docs, repos, articles, etc.).
CREATE TABLE IF NOT EXISTS academy_lesson_resources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  position      int  NOT NULL DEFAULT 0,
  resource_type text NOT NULL CHECK (resource_type IN ('file','link')),
  label         text NOT NULL,
  description   text,
  url           text NOT NULL,
  -- Only set for file resources — lets the UI render the right icon and
  -- a size hint.
  file_mime     text,
  file_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_lesson_resources_lesson_idx
  ON academy_lesson_resources (lesson_id, position);

ALTER TABLE academy_lesson_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lesson_resources_public_read" ON academy_lesson_resources;
CREATE POLICY "lesson_resources_public_read"
  ON academy_lesson_resources FOR SELECT USING (true);
DROP POLICY IF EXISTS "lesson_resources_admin_all" ON academy_lesson_resources;
CREATE POLICY "lesson_resources_admin_all"
  ON academy_lesson_resources USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
  );

-- ── 6. Refresh PostgREST so the new tables + columns are queryable ──────────
NOTIFY pgrst, 'reload schema';
