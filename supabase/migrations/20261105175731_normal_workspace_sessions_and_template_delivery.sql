begin;

create table public.workspace_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  credential_tag text not null check (credential_tag ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index workspace_sessions_expires_at_idx on public.workspace_sessions(expires_at);
alter table public.workspace_sessions enable row level security;
revoke all on public.workspace_sessions from public, anon, authenticated;
grant select, insert, delete on public.workspace_sessions to service_role;

create table public.meta_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id bigint not null references public.leads(id) on delete cascade,
  phone text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'accepted', 'failed', 'unknown', 'suppressed')),
  meta_message_id text,
  failure_reason text,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id, lead_id)
);
create index meta_campaign_deliveries_lead_id_idx on public.meta_campaign_deliveries(lead_id);
alter table public.meta_campaign_deliveries enable row level security;
revoke all on public.meta_campaign_deliveries from public, anon, authenticated;
grant select, insert, update on public.meta_campaign_deliveries to service_role;

-- Normal Leads APIs are authenticated before any real contact is stored here.
revoke all on public.leads, public.campaigns, public.campaign_recipients, public.whatsapp_messages from public, anon, authenticated;

comment on table public.workspace_sessions is 'Hashed browser sessions; raw credentials are never stored. Revoked by sign-out or operator-key rotation.';
comment on table public.meta_campaign_deliveries is 'Atomic, no-retry sends of the approved CPF image template from the new sender only.';

commit;
