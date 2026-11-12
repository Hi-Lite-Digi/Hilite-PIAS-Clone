create table public.gmail_connection (
  id text primary key check (id = 'primary'),
  client_id text not null,
  client_secret_encrypted text not null,
  refresh_token_encrypted text,
  sender_email text check (sender_email is null or sender_email = 'business@hilitedigi.ai'),
  scopes text[] not null default '{}',
  connected_at timestamptz
);
alter table public.gmail_connection enable row level security;
revoke all on public.gmail_connection from public, anon, authenticated;
grant select, insert, update, delete on public.gmail_connection to service_role;

alter table public.hr_discovery_runs drop constraint if exists hr_discovery_runs_provider_check;
alter table public.hr_discovery_runs add constraint hr_discovery_runs_provider_check
  check (provider in ('apollo', 'multi_provider', 'public_web'));
alter table public.hr_prospects drop constraint if exists hr_prospects_provider_check;
alter table public.hr_prospects add constraint hr_prospects_provider_check
  check (provider in ('apollo', 'hunter', 'pdl', 'rocketreach', 'lusha', 'cognism', 'public_web'));
