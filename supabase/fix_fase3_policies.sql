-- Fase 3 — correção de integridade em goal_contributions.
-- Idempotente. Rodar no SQL Editor (arquivo curto; imprime a conferência no final).
--
-- Motivo: a FK goal_id não valida RLS (a checagem de FK não passa pelas
-- políticas), então qualquer usuário conseguia inserir um aporte apontando para
-- a meta de outro usuário — e a trigger recalculava saved_cents somando todos
-- os aportes daquela meta, sem filtrar o dono.
--
-- Este arquivo é o mesmo trecho contido em
-- 20261005000000_fase3_orcamentos_metas.sql (linhas 173-232 e 186-192).

-- 1) trigger: só soma aportes do usuário autenticado
create or replace function public.refresh_goal_progress(p_goal_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(c.amount_cents), 0) into v_total
  from public.goal_contributions c
  where c.goal_id = p_goal_id
    and c.user_id = (select auth.uid());

  update public.goals g
     set saved_cents = v_total,
         status = case
           when v_total >= g.target_cents then 'done'
           when g.status = 'done' then 'active'
           else g.status
         end
   where g.id = p_goal_id
     and g.user_id = (select auth.uid());
end;
$$;

-- 2) política de insert: exige que a meta seja do usuário
drop policy if exists "goal_contributions_insert_own" on public.goal_contributions;
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = (select auth.uid())
    )
  );

-- 3) política de update: mesma exigência no registro novo
drop policy if exists "goal_contributions_update_own" on public.goal_contributions;
create policy "goal_contributions_update_own" on public.goal_contributions
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = (select auth.uid())
    )
  );

-- 4) conferência: as duas políticas precisam ter "exists (... g.user_id = ...)"
select policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'goal_contributions'
order by policyname;
