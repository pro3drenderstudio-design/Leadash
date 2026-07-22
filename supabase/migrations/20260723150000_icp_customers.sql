-- Who the ICP's own customers are (the people/businesses that pay them).
-- Powers offer generation: knowing who your prospect sells to lets the AI
-- craft offers that promise access to or results with those exact customers.
ALTER TABLE workspace_icps ADD COLUMN IF NOT EXISTS customers text;
