-- ─── Admin team overhaul ─────────────────────────────────────────────────────
-- Aligns the admins schema with what the team UI actually supports (4 built-in
-- roles + a "custom" role driven by saved presets), and adds the admin_invites
-- and admin_role_presets tables the codebase already references.
--
-- Background: 013b_admins.sql originally only allowed role IN ('admin','super_admin')
-- and didn't ship the invites/presets tables, so /api/admin/team has been
-- partially broken since it landed.

-- ── 1. admins.role: expand CHECK and rename the legacy 'admin' role ────────────
-- Old constraint blocked everything except 'admin' and 'super_admin'. The four
-- built-in roles the team UI offers are super_admin, support, billing, readonly;
-- a 'custom' role is added so a preset-bound admin can hold an explicit module list.

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;

-- Anyone already created as the legacy 'admin' role should resolve to 'super_admin'
-- (that was the historical intent — there was no support/billing/readonly tier).
UPDATE admins SET role = 'super_admin' WHERE role = 'admin';

ALTER TABLE admins
  ADD CONSTRAINT admins_role_check
  CHECK (role IN ('super_admin', 'support', 'billing', 'readonly', 'custom'));

ALTER TABLE admins ALTER COLUMN role SET DEFAULT 'readonly';

-- ── 2. admins: add the columns the API code already reads/writes ──────────────
-- /api/admin/team selects added_by + added_at + permissions; none of those existed.

ALTER TABLE admins ADD COLUMN IF NOT EXISTS added_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS added_at    timestamptz NOT NULL DEFAULT now();
ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions jsonb       NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS preset_id   uuid;

-- Backfill added_at from created_at on any pre-existing rows
UPDATE admins SET added_at = created_at WHERE added_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;

-- ── 3. admin_role_presets: named bundles of modules ──────────────────────────
-- A preset is just (name, modules[]). Built-in roles (super_admin, support, etc.)
-- are NOT stored here — they're hardcoded in the app so they can't be deleted by
-- mistake. This table only holds user-created custom templates.

CREATE TABLE IF NOT EXISTS admin_role_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  modules     text[] NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Names must be unique case-insensitively so the UI shows clean labels
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_role_presets_name_lower
  ON admin_role_presets (lower(name));

ALTER TABLE admin_role_presets ENABLE ROW LEVEL SECURITY;

-- ── 4. admins.preset_id FK with ON DELETE RESTRICT ───────────────────────────
-- "Edits propagate live; delete blocked if in use" — RESTRICT is exactly that.
-- An attempt to delete a preset that's still referenced by any admin will fail
-- at the DB level, and the API layer surfaces a clean error message.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admins_preset_id_fkey' AND table_name = 'admins'
  ) THEN
    ALTER TABLE admins
      ADD CONSTRAINT admins_preset_id_fkey
      FOREIGN KEY (preset_id) REFERENCES admin_role_presets(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 5. admin_invites: tokenised invitations ──────────────────────────────────
-- The accept route looks up by `token`, so it needs a unique index + a default
-- generator. Each invite carries either a built-in role (with permissions left
-- empty) or role='custom' + preset_id + the snapshot of modules at invite time.

CREATE TABLE IF NOT EXISTS admin_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN ('super_admin', 'support', 'billing', 'readonly', 'custom')),
  permissions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  preset_id     uuid REFERENCES admin_role_presets(id) ON DELETE SET NULL,
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_email      ON admin_invites (lower(email));
CREATE INDEX IF NOT EXISTS idx_admin_invites_token      ON admin_invites (token);
CREATE INDEX IF NOT EXISTS idx_admin_invites_open       ON admin_invites (email) WHERE accepted_at IS NULL;

ALTER TABLE admin_invites ENABLE ROW LEVEL SECURITY;
