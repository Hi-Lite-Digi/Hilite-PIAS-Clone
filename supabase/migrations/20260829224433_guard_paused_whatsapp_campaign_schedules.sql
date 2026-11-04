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
    and campaign.status in ('queued', 'sending')
    and pg_catalog.coalesce(campaign.audience #>> '{delivery,channel}', 'whatsapp') = 'whatsapp';

  if v_count <> pg_catalog.cardinality(p_recipient_ids) then
    raise exception 'Every approved recipient must still be queued for an active WhatsApp campaign.' using errcode = '22023';
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

revoke execute on function public.schedule_whatsapp_campaign_recipients(bigint[], timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.schedule_whatsapp_campaign_recipients(bigint[], timestamptz, integer)
  to service_role;
