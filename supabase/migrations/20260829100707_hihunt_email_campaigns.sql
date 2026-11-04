alter table public.hr_prospects
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at timestamptz;

create unique index if not exists hr_prospects_unsubscribe_token_unique_idx
  on public.hr_prospects (unsubscribe_token);

create table public.hr_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  subject text not null check (char_length(btrim(subject)) between 1 and 220),
  body text not null check (char_length(btrim(body)) between 1 and 12000),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'partial', 'failed')),
  sender_email text not null check (char_length(btrim(sender_email)) between 3 and 320),
  audience_count integer not null default 0 check (audience_count between 0 and 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hr_campaigns_created_at_idx
  on public.hr_campaigns (created_at desc);

create index hr_campaigns_status_idx
  on public.hr_campaigns (status, updated_at desc);

create table public.hr_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.hr_campaigns(id) on delete cascade,
  prospect_id uuid references public.hr_prospects(id) on delete set null,
  prospect_name text not null check (char_length(btrim(prospect_name)) between 1 and 240),
  email text not null check (char_length(btrim(email)) between 3 and 320),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  external_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index hr_campaign_recipients_campaign_email_unique_idx
  on public.hr_campaign_recipients (campaign_id, lower(email));

create unique index hr_campaign_recipients_external_message_unique_idx
  on public.hr_campaign_recipients (external_message_id)
  where external_message_id is not null;

create index hr_campaign_recipients_campaign_status_idx
  on public.hr_campaign_recipients (campaign_id, status);

create index hr_campaign_recipients_prospect_idx
  on public.hr_campaign_recipients (prospect_id)
  where prospect_id is not null;

alter table public.hr_campaigns enable row level security;
alter table public.hr_campaign_recipients enable row level security;

revoke all on table public.hr_campaigns from anon, authenticated;
revoke all on table public.hr_campaign_recipients from anon, authenticated;

grant select, insert, update, delete on table public.hr_campaigns to service_role;
grant select, insert, update, delete on table public.hr_campaign_recipients to service_role;
