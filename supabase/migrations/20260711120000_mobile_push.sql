-- Mobile app push notification infrastructure.
-- Device tokens, per-user notification preferences, and the notifications
-- feed that powers the mobile Notifications screen. All three tables are
-- service-role only (RLS enabled, no policies) — access goes exclusively
-- through the API's requireWorkspace admin client, matching the pattern of
-- every other outreach table.

create table if not exists mobile_device_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  expo_push_token text not null,
  platform        text not null check (platform in ('ios', 'android')),
  device_name     text,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (expo_push_token, workspace_id)
);

create index if not exists mobile_device_tokens_workspace_idx
  on mobile_device_tokens (workspace_id);

create table if not exists mobile_notification_prefs (
  user_id            uuid not null references auth.users(id) on delete cascade,
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  replies_enabled    boolean not null default true,
  positive_only      boolean not null default false,
  milestones_enabled boolean not null default true,
  health_enabled     boolean not null default true,
  quiet_hours_start  smallint,  -- minutes from local midnight; null = quiet hours off
  quiet_hours_end    smallint,
  timezone           text,      -- IANA tz from the device
  updated_at         timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create table if not exists mobile_notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('reply', 'milestone', 'health')),
  title        text not null,
  body         text,
  data         jsonb not null default '{}',  -- { enrollment_id | campaign_id | inbox_id, ai_category? }
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists mobile_notifications_user_ws_created_idx
  on mobile_notifications (user_id, workspace_id, created_at desc);

alter table mobile_device_tokens      enable row level security;
alter table mobile_notification_prefs enable row level security;
alter table mobile_notifications      enable row level security;
