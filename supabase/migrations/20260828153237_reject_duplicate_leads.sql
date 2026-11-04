-- Treat leads as duplicates only when all three identifying fields match.
-- Name and email comparisons ignore casing and repeated surrounding whitespace.
create temporary table lead_duplicate_map (
  duplicate_id bigint primary key,
  canonical_id bigint not null
);

insert into lead_duplicate_map (duplicate_id, canonical_id)
with ranked as (
  select
    id,
    min(id) over (
      partition by
        lower(regexp_replace(btrim(name), '\s+', ' ', 'g')),
        lower(btrim(email)),
        age
    ) as canonical_id
  from public.leads
  where email is not null
    and age is not null
)
select id, canonical_id
from ranked
where id <> canonical_id;

-- Keep the oldest lead id, but retain useful contact data and opt-out state
-- from every duplicate before the redundant rows are removed.
update public.leads as canonical
set
  phone = coalesce(
    canonical.phone,
    (
      select duplicate.phone
      from lead_duplicate_map as mapping
      join public.leads as duplicate on duplicate.id = mapping.duplicate_id
      where mapping.canonical_id = canonical.id
        and nullif(btrim(duplicate.phone), '') is not null
      order by duplicate.id
      limit 1
    )
  ),
  dob = coalesce(
    canonical.dob,
    (
      select duplicate.dob
      from lead_duplicate_map as mapping
      join public.leads as duplicate on duplicate.id = mapping.duplicate_id
      where mapping.canonical_id = canonical.id
        and duplicate.dob is not null
      order by duplicate.id
      limit 1
    )
  ),
  topics = (
    select coalesce(array_agg(distinct topic order by topic), '{}'::text[])
    from (
      select unnest(member.topics) as topic
      from public.leads as member
      where member.id = canonical.id
        or member.id in (
          select mapping.duplicate_id
          from lead_duplicate_map as mapping
          where mapping.canonical_id = canonical.id
        )
    ) as combined_topics
    where nullif(btrim(topic), '') is not null
  ),
  struck = (
    select bool_or(member.struck)
    from public.leads as member
    where member.id = canonical.id
      or member.id in (
        select mapping.duplicate_id
        from lead_duplicate_map as mapping
        where mapping.canonical_id = canonical.id
      )
  ),
  first_captured = (
    select min(member.first_captured)
    from public.leads as member
    where member.id = canonical.id
      or member.id in (
        select mapping.duplicate_id
        from lead_duplicate_map as mapping
        where mapping.canonical_id = canonical.id
      )
  ),
  remarks = (
    select nullif(string_agg(distinct nullif(btrim(member.remarks), ''), E'\n---\n'), '')
    from public.leads as member
    where member.id = canonical.id
      or member.id in (
        select mapping.duplicate_id
        from lead_duplicate_map as mapping
        where mapping.canonical_id = canonical.id
      )
  ),
  source_tabs = (
    select nullif(string_agg(distinct nullif(btrim(member.source_tabs), ''), '; '), '')
    from public.leads as member
    where member.id = canonical.id
      or member.id in (
        select mapping.duplicate_id
        from lead_duplicate_map as mapping
        where mapping.canonical_id = canonical.id
      )
  )
where exists (
  select 1
  from lead_duplicate_map as mapping
  where mapping.canonical_id = canonical.id
);

-- Preserve WhatsApp history by moving it to the canonical lead.
update public.whatsapp_messages as message
set lead_id = mapping.canonical_id
from lead_duplicate_map as mapping
where message.lead_id = mapping.duplicate_id;

-- A campaign may already contain more than one member of a duplicate group.
-- Keep its most meaningful delivery row, then repoint that row to the canonical lead.
create temporary table campaign_recipient_dedupe as
with affected as (
  select
    recipient.id,
    recipient.campaign_id,
    coalesce(mapping.canonical_id, recipient.lead_id) as canonical_lead_id,
    row_number() over (
      partition by recipient.campaign_id, coalesce(mapping.canonical_id, recipient.lead_id)
      order by
        case recipient.status
          when 'sent' then 1
          when 'replied' then 2
          when 'queued' then 3
          when 'paused' then 4
          when 'failed' then 5
          else 6
        end,
        recipient.id
    ) as preference
  from public.campaign_recipients as recipient
  left join lead_duplicate_map as mapping on mapping.duplicate_id = recipient.lead_id
  where mapping.duplicate_id is not null
    or recipient.lead_id in (select canonical_id from lead_duplicate_map)
)
select id, canonical_lead_id, preference
from affected;

delete from public.campaign_recipients as recipient
using campaign_recipient_dedupe as dedupe
where recipient.id = dedupe.id
  and dedupe.preference > 1;

update public.campaign_recipients as recipient
set lead_id = dedupe.canonical_lead_id
from campaign_recipient_dedupe as dedupe
where recipient.id = dedupe.id
  and dedupe.preference = 1
  and recipient.lead_id <> dedupe.canonical_lead_id;

delete from public.leads as duplicate
using lead_duplicate_map as mapping
where duplicate.id = mapping.duplicate_id;

create unique index if not exists leads_name_email_age_unique
  on public.leads (
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')),
    lower(btrim(email)),
    age
  )
  where email is not null
    and age is not null;
