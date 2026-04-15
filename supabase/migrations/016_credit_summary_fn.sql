-- admin_credit_summary: fast aggregate for the Credit Ledger admin page.
-- Uses conditional SUM so the whole thing is a single table scan.
create or replace function admin_credit_summary()
returns table(
  total_granted   bigint,
  total_purchased bigint,
  total_consumed  bigint
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where type in ('grant', 'admin_grant')),  0)::bigint as total_granted,
    coalesce(sum(amount) filter (where type = 'purchase'),                  0)::bigint as total_purchased,
    coalesce(sum(abs(amount)) filter (where type in ('consume', 'admin_deduct')), 0)::bigint as total_consumed
  from lead_credit_transactions;
$$;
