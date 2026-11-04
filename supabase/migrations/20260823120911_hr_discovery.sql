create table public.hr_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apollo'
    check (provider in ('apollo')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  filters jsonb not null default '{}'::jsonb,
  requested_count integer not null default 0 check (requested_count between 0 and 50),
  searched_count integer not null default 0 check (searched_count >= 0),
  saved_count integer not null default 0 check (saved_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index hr_discovery_runs_started_at_idx
  on public.hr_discovery_runs (started_at desc);

create table public.hr_prospects (
  id uuid primary key default gen_random_uuid(),
  discovery_run_id uuid references public.hr_discovery_runs(id) on delete set null,
  provider text not null default 'apollo'
    check (provider in ('apollo')),
  provider_person_id text not null,
  full_name text not null,
  first_name text,
  last_name text,
  job_title text not null,
  seniority text,
  company_name text,
  company_domain text,
  work_email text,
  email_status text,
  linkedin_url text,
  location text,
  hr_match_reason text not null,
  review_status text not null default 'new'
    check (review_status in ('new', 'reviewed', 'qualified', 'rejected', 'converted')),
  suppressed boolean not null default false,
  source_metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_prospects_provider_person_unique unique (provider, provider_person_id)
);

create index hr_prospects_review_status_idx on public.hr_prospects (review_status);
create index hr_prospects_company_name_idx on public.hr_prospects (company_name);
create index hr_prospects_work_email_idx on public.hr_prospects (lower(work_email));
create index hr_prospects_full_name_idx on public.hr_prospects (full_name);

alter table public.hr_discovery_runs enable row level security;
alter table public.hr_prospects enable row level security;

revoke all on table public.hr_discovery_runs from anon, authenticated;
revoke all on table public.hr_prospects from anon, authenticated;

grant all on table public.hr_discovery_runs to service_role;
grant all on table public.hr_prospects to service_role;
