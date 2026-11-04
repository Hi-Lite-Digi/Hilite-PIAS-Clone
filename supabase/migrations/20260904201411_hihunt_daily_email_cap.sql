create index if not exists hr_campaign_recipients_sent_window_idx
  on public.hr_campaign_recipients (sent_at)
  where status = 'sent';

create index if not exists hr_campaign_recipients_sending_window_idx
  on public.hr_campaign_recipients (updated_at)
  where status = 'sending';

create or replace function public.claim_hihunt_email_send_slots(
  p_campaign_id uuid,
  p_recipient_ids uuid[]
)
returns table (
  recipient_id uuid,
  daily_limit integer,
  used_before integer,
  remaining_after integer,
  resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_singapore_now timestamp without time zone;
  v_window_date date;
  v_window_started_at timestamptz;
  v_window_resets_at timestamptz;
  v_used_before integer;
  v_distinct_count integer;
begin
  if p_campaign_id is null then
    raise exception 'Choose a Hi-Hunt campaign.' using errcode = '22023';
  end if;

  if p_recipient_ids is null
    or pg_catalog.cardinality(p_recipient_ids) < 1
    or pg_catalog.cardinality(p_recipient_ids) > 200 then
    raise exception 'Choose between 1 and 200 Hi-Hunt recipients.' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct item)
  into v_distinct_count
  from pg_catalog.unnest(p_recipient_ids) as item;

  if v_distinct_count <> pg_catalog.cardinality(p_recipient_ids) then
    raise exception 'Hi-Hunt recipient IDs must be unique.' using errcode = '22023';
  end if;

  v_singapore_now := pg_catalog.clock_timestamp() at time zone 'Asia/Singapore';
  v_window_date := v_singapore_now::date;
  if v_singapore_now::time < time '07:00:00' then
    v_window_date := v_window_date - 1;
  end if;
  v_window_started_at := (v_window_date + time '07:00:00') at time zone 'Asia/Singapore';
  v_window_resets_at := v_window_started_at + interval '1 day';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pias-hihunt-daily-email-cap', 0)
  );

  select pg_catalog.count(*)::integer
  into v_used_before
  from public.hr_campaign_recipients as recipient
  where (
      recipient.status = 'sent'
      and recipient.sent_at >= v_window_started_at
      and recipient.sent_at < v_window_resets_at
    )
    or (
      recipient.status = 'sending'
      and recipient.updated_at >= v_window_started_at
      and recipient.updated_at < v_window_resets_at
    );

  return query
  with requested as (
    select item.requested_id, item.position
    from pg_catalog.unnest(p_recipient_ids) with ordinality
      as item(requested_id, position)
  ),
  selected as (
    select recipient.id, requested.position
    from requested
    join public.hr_campaign_recipients as recipient
      on recipient.id = requested.requested_id
    where recipient.campaign_id = p_campaign_id
      and recipient.status in ('queued', 'failed')
      and recipient.attempts < 5
    order by requested.position
    limit pg_catalog.greatest(0, 200 - v_used_before)
  ),
  claimed as (
    update public.hr_campaign_recipients as recipient
    set
      status = 'sending',
      attempts = pg_catalog.least(10, recipient.attempts + 1),
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
    from selected
    where recipient.id = selected.id
    returning recipient.id
  ),
  claimed_count as (
    select pg_catalog.count(*)::integer as value from claimed
  )
  select
    claimed.id,
    200,
    v_used_before,
    pg_catalog.greatest(0, 200 - v_used_before - claimed_count.value),
    v_window_resets_at
  from claimed
  join selected on selected.id = claimed.id
  cross join claimed_count
  order by selected.position;
end;
$$;

revoke execute on function public.claim_hihunt_email_send_slots(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_hihunt_email_send_slots(uuid, uuid[])
  to service_role;
