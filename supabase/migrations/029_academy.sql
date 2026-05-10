-- Academy products
CREATE TABLE IF NOT EXISTS academy_products (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  description    text,
  price_ngn      int  NOT NULL,
  credits_grant  int  NOT NULL DEFAULT 0,
  leadash_months int  NOT NULL DEFAULT 0,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE academy_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_products_public_read" ON academy_products FOR SELECT USING (true);
CREATE POLICY "academy_products_admin_all"   ON academy_products USING (
  EXISTS (SELECT 1 FROM workspace_members WHERE user_id = auth.uid() AND role = 'admin')
);

-- Cohorts (intake batches)
CREATE TABLE IF NOT EXISTS academy_cohorts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES academy_products(id),
  name       text NOT NULL,
  starts_at  timestamptz NOT NULL,
  max_seats  int,
  status     text DEFAULT 'upcoming',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE academy_cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_cohorts_public_read" ON academy_cohorts FOR SELECT USING (true);

-- Modules (days / lessons)
CREATE TABLE IF NOT EXISTS academy_modules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          text NOT NULL REFERENCES academy_products(id),
  day_number          int  NOT NULL,
  title               text NOT NULL,
  description         text,
  daily_action        text,
  mux_asset_id        text,
  mux_playback_id     text,
  duration_secs       int,
  unlock_offset_hours int  NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (product_id, day_number)
);

ALTER TABLE academy_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_modules_public_read" ON academy_modules FOR SELECT USING (true);

-- Enrollments
CREATE TABLE IF NOT EXISTS academy_enrollments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id             text NOT NULL REFERENCES academy_products(id),
  cohort_id              uuid REFERENCES academy_cohorts(id),
  status                 text DEFAULT 'active',
  paystack_reference     text UNIQUE,
  amount_kobo            int,
  phone                  text,
  credits_granted        boolean DEFAULT false,
  leadash_access_ends_at timestamptz,
  enrolled_at            timestamptz DEFAULT now(),
  completed_at           timestamptz,
  UNIQUE (user_id, product_id)
);

ALTER TABLE academy_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_enrollments_own" ON academy_enrollments
  FOR ALL USING (auth.uid() = user_id);

-- Progress
CREATE TABLE IF NOT EXISTS academy_progress (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES academy_enrollments(id) ON DELETE CASCADE,
  module_id     uuid NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  completed_at  timestamptz DEFAULT now(),
  UNIQUE (enrollment_id, module_id)
);

ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "academy_progress_own" ON academy_progress
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM academy_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
  );

-- Seed products
INSERT INTO academy_products (id, name, description, price_ngn, credits_grant, leadash_months)
VALUES
  ('challenge', '5-Day Foreign Job Challenge',
   'Land your first foreign job or client in 5 days using real outreach.',
   10000, 4000, 1),
  ('academy', 'Leadash $10k Academy',
   '30-day sprint to a working outreach machine that lands foreign clients.',
   135000, 15000, 4)
ON CONFLICT (id) DO NOTHING;

-- Seed challenge modules
INSERT INTO academy_modules (product_id, day_number, title, description, daily_action, unlock_offset_hours)
VALUES
  ('challenge', 1, 'How Foreign Hiring Actually Works',
   'Understand how companies abroad hire remote talent and where you fit in.',
   'Find 3 target companies in Leadash Discover.',
   0),
  ('challenge', 2, 'Positioning Yourself for Foreign Roles',
   'Craft a positioning statement that makes you obvious to foreign decision-makers.',
   'Write your one-liner positioning statement.',
   24),
  ('challenge', 3, 'Finding the Right Decision Makers',
   'Use Leadash to find the exact person who can hire you at your target companies.',
   'Export 10 contacts from a target company.',
   48),
  ('challenge', 4, 'Crafting Outreach That Gets Replies',
   'Write cold emails that feel personal and get responses from busy executives.',
   'Write and send your first cold email.',
   72),
  ('challenge', 5, 'Following Up + The Full System',
   'Master the follow-up sequence and see the complete outreach machine in action.',
   'Send 3 follow-ups and share your results on the live call.',
   96)
ON CONFLICT (product_id, day_number) DO NOTHING;
