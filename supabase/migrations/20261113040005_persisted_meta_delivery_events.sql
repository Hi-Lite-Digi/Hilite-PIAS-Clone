create table public.meta_delivery_events (
  meta_message_id text not null check (meta_message_id like 'wamid.%'),
  status text not null check (status in ('sent','delivered','read','failed')),
  event_at timestamptz not null,
  errors jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  primary key (meta_message_id,status,event_at)
);
alter table public.meta_delivery_events enable row level security;
revoke all on public.meta_delivery_events from public, anon, authenticated;
grant select, insert on public.meta_delivery_events to service_role;
