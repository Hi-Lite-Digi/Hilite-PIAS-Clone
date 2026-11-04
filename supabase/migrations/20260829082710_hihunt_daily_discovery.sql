alter table public.hr_discovery_runs
  add column if not exists triggered_by text not null default 'manual'
    check (triggered_by in ('manual', 'cron'));

create index if not exists hr_discovery_runs_triggered_by_started_at_idx
  on public.hr_discovery_runs (triggered_by, started_at desc);

with ranked as (
  select
    id,
    row_number() over (
      partition by
        lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')),
        lower(btrim(work_email))
      order by discovered_at asc, id asc
    ) as duplicate_number
  from public.hr_prospects
  where nullif(btrim(full_name), '') is not null
    and nullif(btrim(work_email), '') is not null
)
delete from public.hr_prospects prospects
using ranked
where prospects.id = ranked.id
  and ranked.duplicate_number > 1;

drop index if exists public.hr_prospects_discovery_run_id_idx;

alter table public.hr_prospects
  drop column if exists discovery_run_id;

create unique index if not exists hr_prospects_normalized_name_email_unique_idx
  on public.hr_prospects (
    lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')),
    lower(btrim(work_email))
  )
  where nullif(btrim(full_name), '') is not null
    and nullif(btrim(work_email), '') is not null;

create or replace function public.ingest_hr_prospects(p_prospects jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.hr_prospects (
    provider,
    provider_person_id,
    full_name,
    first_name,
    last_name,
    job_title,
    seniority,
    company_name,
    company_domain,
    work_email,
    email_status,
    linkedin_url,
    location,
    hr_match_reason,
    review_status,
    suppressed,
    source_metadata,
    discovered_at,
    updated_at
  )
  select
    coalesce(nullif(btrim(candidate.provider), ''), 'apollo'),
    candidate.provider_person_id,
    candidate.full_name,
    candidate.first_name,
    candidate.last_name,
    candidate.job_title,
    candidate.seniority,
    candidate.company_name,
    candidate.company_domain,
    candidate.work_email,
    candidate.email_status,
    candidate.linkedin_url,
    candidate.location,
    candidate.hr_match_reason,
    coalesce(nullif(btrim(candidate.review_status), ''), 'new'),
    coalesce(candidate.suppressed, false),
    coalesce(candidate.source_metadata, '{}'::jsonb),
    coalesce(candidate.discovered_at, now()),
    coalesce(candidate.updated_at, now())
  from jsonb_to_recordset(coalesce(p_prospects, '[]'::jsonb)) as candidate (
    provider text,
    provider_person_id text,
    full_name text,
    first_name text,
    last_name text,
    job_title text,
    seniority text,
    company_name text,
    company_domain text,
    work_email text,
    email_status text,
    linkedin_url text,
    location text,
    hr_match_reason text,
    review_status text,
    suppressed boolean,
    source_metadata jsonb,
    discovered_at timestamptz,
    updated_at timestamptz
  )
  where nullif(btrim(candidate.provider_person_id), '') is not null
    and nullif(btrim(candidate.full_name), '') is not null
    and nullif(btrim(candidate.job_title), '') is not null
    and nullif(btrim(candidate.work_email), '') is not null
    and nullif(btrim(candidate.hr_match_reason), '') is not null
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.ingest_hr_prospects(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_hr_prospects(jsonb) to service_role;
