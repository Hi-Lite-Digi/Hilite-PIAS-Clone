-- Shared browser login uses a separate password hash. Integration keys stay intact.
create table public.workspace_login_rates (
  key text primary key check (length(key) = 64),
  window_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.workspace_login_rates enable row level security;
revoke all on public.workspace_login_rates from anon, authenticated;
grant all on public.workspace_login_rates to service_role;

create function public.check_workspace_login_rate(p_key text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare attempt_count integer;
begin
  insert into public.workspace_login_rates as rates (key) values (p_key)
  on conflict (key) do update set
    attempts = case when rates.window_at < now() - interval '1 minute' then 1 else rates.attempts + 1 end,
    window_at = case when rates.window_at < now() - interval '1 minute' then now() else rates.window_at end
  returning attempts into attempt_count;
  delete from public.workspace_login_rates where window_at < now() - interval '1 day';
  return attempt_count <= 10;
end;
$$;
revoke all on function public.check_workspace_login_rate(text) from public, anon, authenticated;
grant execute on function public.check_workspace_login_rate(text) to service_role;
