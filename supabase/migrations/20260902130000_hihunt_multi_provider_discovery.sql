alter table public.hr_discovery_runs
  drop constraint if exists hr_discovery_runs_provider_check;

alter table public.hr_discovery_runs
  add constraint hr_discovery_runs_provider_check
  check (provider in ('apollo', 'multi_provider'));

alter table public.hr_prospects
  drop constraint if exists hr_prospects_provider_check;

alter table public.hr_prospects
  add constraint hr_prospects_provider_check
  check (provider in ('apollo', 'hunter', 'pdl', 'rocketreach', 'lusha', 'cognism'));

create or replace function public.ingest_hr_prospects(p_prospects jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  with candidates as (
    select distinct on (lower(btrim(candidate.work_email))) candidate.*
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
    order by lower(btrim(candidate.work_email)), candidate.provider, candidate.provider_person_id
  )
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
    lower(btrim(candidate.work_email)),
    candidate.email_status,
    candidate.linkedin_url,
    candidate.location,
    candidate.hr_match_reason,
    coalesce(nullif(btrim(candidate.review_status), ''), 'new'),
    coalesce(candidate.suppressed, false),
    coalesce(candidate.source_metadata, '{}'::jsonb),
    coalesce(candidate.discovered_at, now()),
    coalesce(candidate.updated_at, now())
  from candidates candidate
  where not exists (
    select 1
    from public.hr_prospects existing
    where lower(btrim(existing.work_email)) = lower(btrim(candidate.work_email))
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.ingest_hr_prospects(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_hr_prospects(jsonb) to service_role;
