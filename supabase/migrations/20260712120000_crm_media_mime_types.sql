-- .m4a voice recordings (Voice Memos, iPhone recordings, uploaded via the
-- CRM composer's attach button) can report as audio/x-m4a or other
-- MPEG-4-family MIME types depending on OS/browser, none of which were in
-- the original crm-media allowlist.
update storage.buckets
set allowed_mime_types = array_cat(
  allowed_mime_types,
  array['audio/x-m4a', 'audio/mp4a-latm', 'audio/x-caf', 'audio/3gpp']
)
where id = 'crm-media'
  and not (allowed_mime_types @> array['audio/x-m4a']);
