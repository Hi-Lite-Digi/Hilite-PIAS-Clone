-- Supabase's automatic-RLS event trigger runs as its database owner. It does
-- not need to be callable through the Data API by public or signed-in users.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
