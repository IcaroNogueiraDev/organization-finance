-- Correção da Fase 1: a migration 20261004000000_init.sql foi aplicada só até
-- o `enable row security`; POLÍTICAS RLS, função e trigger do seed de categorias
-- nunca chegaram a ser criados (confirmado via public.diag_all(): policies = []).
--
-- Este arquivo reaplica apenas a parte que faltou, de forma idempotente.

-- ---------------------------------------------------------------------------
-- Políticas RLS (todas as 6 tabelas)
-- ---------------------------------------------------------------------------
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select using (user_id = (select auth.uid()));
drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete using (user_id = (select auth.uid()));

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (user_id = (select auth.uid()));
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (user_id = (select auth.uid()));

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own" on public.budgets
  for select using (user_id = (select auth.uid()));
drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own" on public.budgets
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own" on public.budgets
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own" on public.budgets
  for delete using (user_id = (select auth.uid()));

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals
  for select using (user_id = (select auth.uid()));
drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals
  for delete using (user_id = (select auth.uid()));

drop policy if exists "goal_contributions_select_own" on public.goal_contributions;
create policy "goal_contributions_select_own" on public.goal_contributions
  for select using (user_id = (select auth.uid()));
drop policy if exists "goal_contributions_insert_own" on public.goal_contributions;
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "goal_contributions_update_own" on public.goal_contributions;
create policy "goal_contributions_update_own" on public.goal_contributions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "goal_contributions_delete_own" on public.goal_contributions;
create policy "goal_contributions_delete_own" on public.goal_contributions
  for delete using (user_id = (select auth.uid()));

drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own" on public.ai_messages
  for select using (user_id = (select auth.uid()));
drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own" on public.ai_messages
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "ai_messages_delete_own" on public.ai_messages;
create policy "ai_messages_delete_own" on public.ai_messages
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Seed de categorias padrão ao criar usuário (trigger em auth.users)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, kind, color) values
    (new.id, 'Salário', 'income', null, '#16a34a'),
    (new.id, 'Freelance', 'income', null, '#22c55e'),
    (new.id, 'Outras receitas', 'income', null, '#4ade80'),
    (new.id, 'Moradia', 'expense', 'fixed', '#ef4444'),
    (new.id, 'Alimentação', 'expense', 'variable', '#f97316'),
    (new.id, 'Transporte', 'expense', 'variable', '#eab308'),
    (new.id, 'Saúde', 'expense', 'essential', '#06b6d4'),
    (new.id, 'Educação', 'expense', 'essential', '#3b82f6'),
    (new.id, 'Lazer', 'expense', 'non_essential', '#a855f7'),
    (new.id, 'Compras', 'expense', 'non_essential', '#ec4899'),
    (new.id, 'Assinaturas', 'expense', 'fixed', '#8b5cf6'),
    (new.id, 'Outras despesas', 'expense', 'variable', '#64748b');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A função só roda via trigger; não expor para roles de cliente
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Conferência: deve retornar 23 políticas e 1 trigger
select count(*) as politicas from pg_policies
where schemaname = 'public' and tablename in
  ('categories', 'transactions', 'budgets', 'goals', 'goal_contributions', 'ai_messages');

select t.tgname from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
