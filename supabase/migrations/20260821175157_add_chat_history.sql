create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_updated_at_idx on public.chat_threads (updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  action text,
  audience jsonb,
  lead_count integer,
  lead_preview jsonb not null default '[]'::jsonb,
  model text,
  status text not null default 'complete'
    check (status in ('pending', 'complete', 'error')),
  created_at timestamptz not null default now()
);

create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at asc);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.chat_threads from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;

grant all on table public.chat_threads to service_role;
grant all on table public.chat_messages to service_role;
