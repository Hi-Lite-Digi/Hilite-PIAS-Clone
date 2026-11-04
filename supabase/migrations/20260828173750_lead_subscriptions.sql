alter table public.leads
  add column if not exists subscribed boolean,
  add column if not exists unsubscribe_token uuid,
  add column if not exists unsubscribed_at timestamptz;

-- Existing leads begin subscribed, while each lead receives a private capability
-- token used only by the server-side unsubscribe endpoint.
update public.leads
set subscribed = true
where subscribed is null;

update public.leads
set unsubscribe_token = gen_random_uuid()
where unsubscribe_token is null;

alter table public.leads
  alter column subscribed set default true,
  alter column subscribed set not null,
  alter column unsubscribe_token set default gen_random_uuid(),
  alter column unsubscribe_token set not null;

create unique index if not exists leads_unsubscribe_token_unique
  on public.leads (unsubscribe_token);

comment on column public.leads.subscribed is
  'Whether this lead may receive PIAS campaign email, WhatsApp, and reminder messages.';

comment on column public.leads.unsubscribe_token is
  'Private capability token for the public unsubscribe confirmation flow; never expose in lead-list APIs.';
