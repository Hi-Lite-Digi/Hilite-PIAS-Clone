-- Email conversations for the isolated portfolio demo. Live Gmail uses its own API.
create table public.demo_email_threads (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.demo_email_threads enable row level security;
revoke all on public.demo_email_threads from public, anon, authenticated;
grant select, insert, update, delete on public.demo_email_threads to service_role;
