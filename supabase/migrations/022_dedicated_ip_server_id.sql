-- Add postal_server_id to track the dedicated Postal server (separate from the IP pool row)
ALTER TABLE dedicated_ip_subscriptions ADD COLUMN IF NOT EXISTS postal_server_id integer;
