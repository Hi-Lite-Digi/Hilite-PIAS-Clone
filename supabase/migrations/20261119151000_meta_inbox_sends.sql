create table public.meta_inbox_sends (
  request_key text primary key check (length(request_key) = 64),
  fingerprint text not null check (length(fingerprint) = 64),
  status text not null check (status in ('sending','accepted','failed','unknown')),
  meta_message_id text,
  history_saved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.meta_inbox_sends enable row level security;
revoke all on public.meta_inbox_sends from anon, authenticated;
grant all on public.meta_inbox_sends to service_role;
