-- Diagnóstico único: cria public.diag_all() e devolve tudo que preciso saber
-- (políticas RLS, trigger, contagens, RLS habilitado, grants).
-- Rodar 1x no SQL Editor. Depois eu removo a função.
create or replace function public.diag_all()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'policies', (
      select coalesce(jsonb_agg(
        jsonb_build_object('table', tablename, 'name', policyname, 'cmd', cmd,
                           'qual', qual, 'check', with_check)
        order by tablename, policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'public'
        and tablename in ('categories', 'transactions')),
    'triggers_auth_users', (
      select coalesce(jsonb_agg(
        jsonb_build_object('name', t.tgname, 'fn', p.proname, 'enabled', t.tgenabled)),
        '[]'::jsonb)
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal),
    'rls_habilitado', (
      select coalesce(jsonb_agg(
        jsonb_build_object('table', c.relname, 'rowsecurity', c.relrowsecurity)),
        '[]'::jsonb)
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'r'
        and c.relname in ('categories', 'transactions', 'budgets', 'goals',
                          'goal_contributions', 'ai_messages')),
    'counts', jsonb_build_object(
      'transacoes', (select count(*) from public.transactions),
      'categorias', (select count(*) from public.categories),
      'usuarios_seed', (select count(*) from auth.users
                        where id in ('00000000-0000-4000-8000-00000000000a',
                                     '00000000-0000-4000-8000-00000000000b')),
      'transacoes_seed', (select count(*) from public.transactions
                          where user_id in ('00000000-0000-4000-8000-00000000000a',
                                            '00000000-0000-4000-8000-00000000000b')),
      'categorias_seed', (select count(*) from public.categories
                          where user_id in ('00000000-0000-4000-8000-00000000000a',
                                            '00000000-0000-4000-8000-00000000000b')),
      'identidades_seed', (select count(*) from auth.identities
                           where user_id in ('00000000-0000-4000-8000-00000000000a',
                                             '00000000-0000-4000-8000-00000000000b'))),
    'grants_public', (
      select coalesce(jsonb_agg(
        jsonb_build_object('table', table_name, 'grantee', grantee, 'priv', privilege_type)),
        '[]'::jsonb)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('categories', 'transactions')
        and grantee in ('anon', 'authenticated')),
    'handle_new_user_existe', exists(
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_new_user')
  )
  into result;

  return result;
end;
$$;

revoke all on function public.diag_all() from public, anon;
grant execute on function public.diag_all() to authenticated;

select public.diag_all();
