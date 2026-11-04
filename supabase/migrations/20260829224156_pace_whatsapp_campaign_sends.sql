alter table public.campaign_recipients
  add column if not exists scheduled_at timestamptz,
  add column if not exists consent_confirmed_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists last_attempt_at timestamptz;

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_status_check;

alter table public.campaign_recipients
  add constraint campaign_recipients_status_check
  check (status = any (array[
    'queued'::text,
    'scheduled'::text,
    'sending'::text,
    'sent'::text,
    'failed'::text,
    'replied'::text,
    'suppressed'::text
  ]));

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_attempts_check;

alter table public.campaign_recipients
  add constraint campaign_recipients_attempts_check
  check (attempts >= 0);

create index if not exists campaign_recipients_scheduled_due_idx
  on public.campaign_recipients (scheduled_at, id)
  where status = 'scheduled';

create index if not exists campaign_recipients_sending_lock_idx
  on public.campaign_recipients (locked_until)
  where status = 'sending';

create or replace function public.schedule_whatsapp_campaign_recipients(
  p_recipient_ids bigint[],
  p_approved_at timestamptz default now(),
  p_interval_seconds integer default 60
)
returns table (recipient_id bigint, scheduled_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base timestamptz;
  v_count integer;
  v_distinct_count integer;
begin
  if p_recipient_ids is null
    or pg_catalog.cardinality(p_recipient_ids) < 1
    or pg_catalog.cardinality(p_recipient_ids) > 200 then
    raise exception 'Choose between 1 and 200 campaign recipients.' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct item)
  into v_distinct_count
  from pg_catalog.unnest(p_recipient_ids) as item;

  if v_distinct_count <> pg_catalog.cardinality(p_recipient_ids) then
    raise exception 'Campaign recipient IDs must be unique.' using errcode = '22023';
  end if;

  if p_interval_seconds < 60 or p_interval_seconds > 3600 then
    raise exception 'The campaign send interval must be between 60 and 3600 seconds.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pias-whatsapp-campaign-schedule', 0)
  );

  select pg_catalog.count(*)
  into v_count
  from public.campaign_recipients as recipient
  join public.campaigns as campaign on campaign.id = recipient.campaign_id
  where recipient.id = any (p_recipient_ids)
    and recipient.status = 'queued'
    and pg_catalog.coalesce(campaign.audience #>> '{delivery,channel}', 'whatsapp') = 'whatsapp';

  if v_count <> pg_catalog.cardinality(p_recipient_ids) then
    raise exception 'Every approved recipient must still be queued for a WhatsApp campaign.' using errcode = '22023';
  end if;

  select pg_catalog.greatest(
    p_approved_at,
    pg_catalog.coalesce(
      pg_catalog.max(recipient.scheduled_at)
        + pg_catalog.make_interval(secs => p_interval_seconds::double precision),
      p_approved_at
    )
  )
  into v_base
  from public.campaign_recipients as recipient
  where recipient.status in ('scheduled', 'sending')
    and recipient.scheduled_at is not null;

  return query
  with requested as (
    select
      item.recipient_id,
      item.position - 1 as offset_index
    from pg_catalog.unnest(p_recipient_ids) with ordinality
      as item(recipient_id, position)
  )
  update public.campaign_recipients as recipient
  set
    status = 'scheduled',
    scheduled_at = v_base
      + pg_catalog.make_interval(
          secs => (requested.offset_index * p_interval_seconds)::double precision
        ),
    consent_confirmed_at = p_approved_at,
    locked_until = null,
    failed_at = null,
    failure_reason = null
  from requested
  where recipient.id = requested.recipient_id
  returning recipient.id, recipient.scheduled_at;
end;
$$;

create or replace function public.claim_due_whatsapp_campaign_recipient(
  p_now timestamptz default now(),
  p_lock_seconds integer default 240
)
returns setof public.campaign_recipients
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_lock_seconds < 30 or p_lock_seconds > 600 then
    raise exception 'The dispatcher lock must be between 30 and 600 seconds.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pias-whatsapp-campaign-dispatch', 0)
  );

  update public.campaign_recipients
  set
    status = 'scheduled',
    scheduled_at = pg_catalog.greatest(pg_catalog.coalesce(scheduled_at, p_now), p_now),
    locked_until = null,
    failure_reason = pg_catalog.coalesce(failure_reason, 'The previous delivery lock expired and was released.')
  where status = 'sending'
    and locked_until is not null
    and locked_until <= p_now;

  if exists (
    select 1
    from public.campaign_recipients
    where status = 'sending'
      and locked_until > p_now
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.whatsapp_messages
    where direction = 'outbound'
      and raw_metadata ->> 'source' = 'hihunt_campaign'
      and occurred_at > p_now - pg_catalog.make_interval(secs => 60)
  ) then
    return;
  end if;

  return query
  with candidate as (
    select recipient.id
    from public.campaign_recipients as recipient
    join public.campaigns as campaign on campaign.id = recipient.campaign_id
    where recipient.status = 'scheduled'
      and recipient.scheduled_at <= p_now
      and campaign.status in ('queued', 'sending')
      and pg_catalog.coalesce(campaign.audience #>> '{delivery,channel}', 'whatsapp') = 'whatsapp'
    order by recipient.scheduled_at asc, recipient.id asc
    for update of recipient skip locked
    limit 1
  )
  update public.campaign_recipients as recipient
  set
    status = 'sending',
    attempts = recipient.attempts + 1,
    last_attempt_at = p_now,
    locked_until = p_now
      + pg_catalog.make_interval(secs => p_lock_seconds::double precision),
    failure_reason = null
  from candidate
  where recipient.id = candidate.id
  returning recipient.*;
end;
$$;

revoke execute on function public.schedule_whatsapp_campaign_recipients(bigint[], timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.schedule_whatsapp_campaign_recipients(bigint[], timestamptz, integer)
  to service_role;

revoke execute on function public.claim_due_whatsapp_campaign_recipient(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_campaign_recipient(timestamptz, integer)
  to service_role;
