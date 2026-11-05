begin;

-- Real test contacts are separate from the public fictional demo dataset.
create table public.meta_test_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  phone text not null unique check (phone ~ '^[1-9][0-9]{7,14}$'),
  consented boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.meta_test_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  lead_id uuid not null references public.meta_test_leads(id),
  status text not null default 'draft' check (status in ('draft', 'sending', 'accepted', 'failed', 'unknown')),
  meta_message_id text,
  attempted_at timestamptz,
  created_at timestamptz not null default now()
);

create index meta_test_campaigns_lead_id_idx on public.meta_test_campaigns(lead_id);
create index meta_test_campaigns_created_at_idx on public.meta_test_campaigns(created_at desc);

alter table public.meta_test_leads enable row level security;
alter table public.meta_test_campaigns enable row level security;
revoke all on public.meta_test_leads, public.meta_test_campaigns from public, anon, authenticated;
grant select, insert, update on public.meta_test_leads, public.meta_test_campaigns to service_role;

comment on table public.meta_test_leads is 'Private test contacts; accessible only through the operator-key-protected server API.';
comment on table public.meta_test_campaigns is 'One explicit recipient per campaign; atomic draft claim prevents duplicate sends.';

commit;
