-- Seed da Fase 2 (auto-suficiente): diagnóstico + 2 usuários + categorias +
-- 20 transações (A) + 3 (B). Idempotente: pode rodar quantas vezes quiser.
--
-- Credenciais de teste (SOMENTE desenvolvimento):
--   seed-a@orgfinance.dev / SeedFase2!2026   -> 20 transações (ago/set/out 2026)
--   seed-b@orgfinance.dev / SeedFase2!2026   -> 3 transações (isolamento RLS)
--
-- Rodar DEPOIS de 20261004120000_fase2_funcoes.sql.

-- ===========================================================================
-- 0) DIAGNÓSTICO (só SELECTs; me mande estes resultados se algo falhar)
-- ===========================================================================
-- 0.1 políticas RLS reais da tabela
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('categories', 'transactions')
order by tablename, policyname;

-- 0.2 trigger de categorias padrão no cadastro
select t.tgname, p.proname as funcao, t.tgenabled
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- 0.3 quantidades reais (importante: mostram se as linhas do seed anterior existem)
select 'transacoes' as o, count(*)::text as total from public.transactions
union all
select 'categorias', count(*)::text from public.categories
union all
select 'identidades_seed', count(*)::text from auth.identities
  where user_id in ('00000000-0000-4000-8000-00000000000a',
                    '00000000-0000-4000-8000-00000000000b')
union all
select 'usuarios_seed', count(*)::text from auth.users
  where id in ('00000000-0000-4000-8000-00000000000a',
               '00000000-0000-4000-8000-00000000000b');

-- 0.4 colunas que precisam ser '' e não NULL (login retorna 500 se forem NULL)
select email,
       coalesce(nullif(confirmation_token, ''), '<NULL/vazio>')  as confirmation_token,
       coalesce(nullif(email_change, ''), '<NULL/vazio>')        as email_change,
       coalesce(nullif(email_change_token_new, ''), '<NULL/vazio>') as token_new,
       coalesce(nullif(recovery_token, ''), '<NULL/vazio>')      as recovery_token
from auth.users
where id in ('00000000-0000-4000-8000-00000000000a',
             '00000000-0000-4000-8000-00000000000b');

-- 0.5 helper: deixa eu ler auth.uid()/role/claims pela API (depois eu removo)
create or replace function public.test_uid()
returns jsonb
language sql stable security invoker
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'current_user', current_user,
    'jwt_role', coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '<sem claims>'),
    'jwt_sub', coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '<sem claims>')
  );
$$;
revoke all on function public.test_uid() from public;
grant execute on function public.test_uid() to authenticated;
select public.test_uid() as anon_na_editor;

-- ===========================================================================
-- 1) Usuários de teste (se já existirem, são recriados)
-- ===========================================================================
do $$
declare
  uid_a uuid := '00000000-0000-4000-8000-00000000000a';
  uid_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  delete from auth.users where id in (uid_a, uid_b);

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values
    (uid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'seed-a@orgfinance.dev',
     extensions.crypt('SeedFase2!2026', extensions.gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"name":"Seed A","full_name":"Seed A"}'::jsonb, now(), now(),
     '', '', '', '', '', '', '', ''),
    (uid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'seed-b@orgfinance.dev',
     extensions.crypt('SeedFase2!2026', extensions.gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"name":"Seed B","full_name":"Seed B"}'::jsonb, now(), now(),
     '', '', '', '', '', '', '', '');
end $$;

-- ===========================================================================
-- 2) Identidades "email" (login por senha)
-- ===========================================================================
do $$
declare
  uid_a uuid := '00000000-0000-4000-8000-00000000000a';
  uid_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  delete from auth.identities where user_id in (uid_a, uid_b);
  begin
    insert into auth.identities (user_id, provider_id, provider, identity_data,
                                 last_sign_in_at, created_at, updated_at)
    values
      (uid_a, uid_a::text, 'email',
       jsonb_build_object('sub', uid_a, 'email', 'seed-a@orgfinance.dev',
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now()),
      (uid_b, uid_b::text, 'email',
       jsonb_build_object('sub', uid_b, 'email', 'seed-b@orgfinance.dev',
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now());
  exception when others then
    insert into auth.identities (user_id, provider, identity_data,
                                 last_sign_in_at, created_at, updated_at)
    values
      (uid_a, 'email',
       jsonb_build_object('sub', uid_a, 'email', 'seed-a@orgfinance.dev',
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now()),
      (uid_b, 'email',
       jsonb_build_object('sub', uid_b, 'email', 'seed-b@orgfinance.dev',
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now());
  end;
end $$;

-- ===========================================================================
-- 3) Categorias padrão (mesmas do trigger handle_new_user; criadas mesmo se o
--    trigger não tiver disparado)
-- ===========================================================================
do $$
declare
  uid_a uuid := '00000000-0000-4000-8000-00000000000a';
  uid_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  insert into public.categories (user_id, name, type, kind, color)
  select v.uid, v.name, v.type, v.kind, v.color
  from (values
    (uid_a, 'Salário', 'income', null::text, '#16a34a'),
    (uid_a, 'Freelance', 'income', null, '#22c55e'),
    (uid_a, 'Outras receitas', 'income', null, '#4ade80'),
    (uid_a, 'Moradia', 'expense', 'fixed', '#ef4444'),
    (uid_a, 'Alimentação', 'expense', 'variable', '#f97316'),
    (uid_a, 'Transporte', 'expense', 'variable', '#eab308'),
    (uid_a, 'Saúde', 'expense', 'essential', '#06b6d4'),
    (uid_a, 'Educação', 'expense', 'essential', '#3b82f6'),
    (uid_a, 'Lazer', 'expense', 'non_essential', '#a855f7'),
    (uid_a, 'Compras', 'expense', 'non_essential', '#ec4899'),
    (uid_a, 'Assinaturas', 'expense', 'fixed', '#8b5cf6'),
    (uid_a, 'Outras despesas', 'expense', 'variable', '#64748b'),
    (uid_b, 'Salário', 'income', null, '#16a34a'),
    (uid_b, 'Freelance', 'income', null, '#22c55e'),
    (uid_b, 'Outras receitas', 'income', null, '#4ade80'),
    (uid_b, 'Moradia', 'expense', 'fixed', '#ef4444'),
    (uid_b, 'Alimentação', 'expense', 'variable', '#f97316'),
    (uid_b, 'Transporte', 'expense', 'variable', '#eab308'),
    (uid_b, 'Saúde', 'expense', 'essential', '#06b6d4'),
    (uid_b, 'Educação', 'expense', 'essential', '#3b82f6'),
    (uid_b, 'Lazer', 'expense', 'non_essential', '#a855f7'),
    (uid_b, 'Compras', 'expense', 'non_essential', '#ec4899'),
    (uid_b, 'Assinaturas', 'expense', 'fixed', '#8b5cf6'),
    (uid_b, 'Outras despesas', 'expense', 'variable', '#64748b')
  ) as v(uid, name, type, kind, color)
  where not exists (
    select 1 from public.categories c
    where c.user_id = v.uid and c.name = v.name and c.type = v.type
  );
end $$;

-- ===========================================================================
-- 4) Transações: 20 do A em 3 meses + 3 do B (se já existirem, são recriadas)
--    Totais esperados:
--      2026-08 A: receita 430000, despesa 193400, saldo 236600  (7)
--      2026-09 A: receita 350000, despesa 209590, saldo 140410  (7)
--      2026-10 A: receita 395000, despesa 176000, saldo 219000  (6)
--      A geral : receita 1175000, despesa 578990, saldo 596010  (20 = 5 receitas + 15 despesas)
--      B geral : receita  100000, despesa  80000, saldo  20000  (3)
-- ===========================================================================
delete from public.transactions
where user_id in ('00000000-0000-4000-8000-00000000000a',
                  '00000000-0000-4000-8000-00000000000b');

insert into public.transactions (user_id, category_id, type, amount_cents, description, occurred_on)
select v.user_id::uuid, c.id, v.type, v.amount_cents, v.description, v.occurred_on
from (values
  ('00000000-0000-4000-8000-00000000000a', 'Salário',       'income',  350000, 'Salário agosto',              date '2026-08-01'),
  ('00000000-0000-4000-8000-00000000000a', 'Moradia',       'expense', 120000, 'Aluguel agosto',              date '2026-08-05'),
  ('00000000-0000-4000-8000-00000000000a', 'Alimentação',   'expense',  45500, 'Supermercado',                date '2026-08-07'),
  ('00000000-0000-4000-8000-00000000000a', null,            'expense',  12000, 'Combustível (sem categoria)', date '2026-08-12'),
  ('00000000-0000-4000-8000-00000000000a', 'Freelance',     'income',   80000, 'Freelance projeto X',         date '2026-08-15'),
  ('00000000-0000-4000-8000-00000000000a', 'Saúde',         'expense',   9900, 'Consulta médica',             date '2026-08-20'),
  ('00000000-0000-4000-8000-00000000000a', 'Lazer',         'expense',   6000, 'Cinema',                      date '2026-08-28'),
  ('00000000-0000-4000-8000-00000000000a', 'Salário',       'income',  350000, 'Salário setembro',            date '2026-09-01'),
  ('00000000-0000-4000-8000-00000000000a', 'Moradia',       'expense', 120000, 'Aluguel setembro',            date '2026-09-03'),
  ('00000000-0000-4000-8000-00000000000a', 'Alimentação',   'expense',  31200, 'Feira',                       date '2026-09-08'),
  ('00000000-0000-4000-8000-00000000000a', 'Assinaturas',   'expense',   5500, 'Streaming',                   date '2026-09-10'),
  ('00000000-0000-4000-8000-00000000000a', 'Educação',      'expense',  19900, 'Curso online',                date '2026-09-14'),
  ('00000000-0000-4000-8000-00000000000a', 'Compras',       'expense',  24990, 'Tênis',                       date '2026-09-18'),
  ('00000000-0000-4000-8000-00000000000a', 'Transporte',    'expense',   8000, 'Ônibus e metrô',              date '2026-09-25'),
  ('00000000-0000-4000-8000-00000000000a', 'Salário',       'income',  350000, 'Salário outubro',             date '2026-10-01'),
  ('00000000-0000-4000-8000-00000000000a', 'Moradia',       'expense', 120000, 'Aluguel outubro',             date '2026-10-01'),
  ('00000000-0000-4000-8000-00000000000a', 'Alimentação',   'expense',  27800, 'Mercado',                     date '2026-10-02'),
  ('00000000-0000-4000-8000-00000000000a', 'Transporte',    'expense',  15000, 'Gasolina',                    date '2026-10-03'),
  ('00000000-0000-4000-8000-00000000000a', 'Saúde',         'expense',  13200, 'Farmácia',                    date '2026-10-04'),
  ('00000000-0000-4000-8000-00000000000a', 'Freelance',     'income',   45000, 'Freelance projeto Y',         date '2026-10-04'),
  ('00000000-0000-4000-8000-00000000000b', 'Salário',       'income',  100000, 'Salário B setembro',          date '2026-09-05'),
  ('00000000-0000-4000-8000-00000000000b', 'Alimentação',   'expense',  50000, 'Mercado B',                   date '2026-09-06'),
  ('00000000-0000-4000-8000-00000000000b', 'Lazer',         'expense',  30000, 'Show B',                      date '2026-10-02')
) as v(user_id, cat_name, type, amount_cents, description, occurred_on)
left join public.categories c
  on c.user_id = v.user_id::uuid
 and c.name = v.cat_name
 and c.type = v.type;

-- ===========================================================================
-- 5) RELATÓRIO FINAL (esperado: seed-a 20/1175000/578990 e seed-b 3/100000/80000)
-- ===========================================================================
select u.email,
       count(t.id) as transacoes,
       coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)  as receita_cents,
       coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0) as despesa_cents,
       (select count(*) from public.categories c where c.user_id = u.id) as categorias
from auth.users u
left join public.transactions t on t.user_id = u.id
where u.id in ('00000000-0000-4000-8000-00000000000a',
               '00000000-0000-4000-8000-00000000000b')
group by u.id
order by u.email;
