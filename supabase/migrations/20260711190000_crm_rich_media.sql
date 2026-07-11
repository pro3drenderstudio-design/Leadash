-- Private bucket for CRM rich media: images, docs, audio (voice notes), video.
-- Covers both email attachments (Postal) and WhatsApp media (Meta Graph API),
-- inbound and outbound, both CRM surfaces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-media', 'crm-media', false, 52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv','application/zip',
    'audio/mpeg','audio/ogg','audio/mp4','audio/aac','audio/amr','audio/webm',
    'video/mp4','video/webm','video/3gpp'
  ]
)
on conflict (id) do nothing;

-- crm_messages: attachments jsonb already exists ({name, mimeType, size, url}[]).
-- Add structured columns for WhatsApp location/contact-share message types.
alter table crm_messages
  add column if not exists location jsonb,
  add column if not exists contacts jsonb not null default '[]'::jsonb;

comment on column crm_messages.location is 'WhatsApp location share: {latitude, longitude, name?, address?}';
comment on column crm_messages.contacts is 'WhatsApp contact share: [{name, phone}]';

-- outreach_sends: outbound cold-email attachments (outreach_replies already has
-- this column for inbound; outbound never needed it until composer attach/send).
alter table outreach_sends add column if not exists attachments jsonb not null default '[]'::jsonb;
comment on column outreach_sends.attachments is 'Outbound attachments: [{name, mimeType, size, url}]';
