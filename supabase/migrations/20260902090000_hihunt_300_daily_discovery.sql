alter table public.hr_discovery_runs
  drop constraint if exists hr_discovery_runs_requested_count_check;

alter table public.hr_discovery_runs
  add constraint hr_discovery_runs_requested_count_check
  check (requested_count between 0 and 300);
