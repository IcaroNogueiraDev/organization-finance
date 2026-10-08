-- Fase 3: orçamentos, metas e plano de poupança
-- Conforme PLANO.md (Seção 3 — Fase 3). Valores monetários em centavos (inteiro).
-- Padrão da Fase 2: security invoker (RLS do usuário vale dentro das funções),
-- search_path fixo e privilégios só para `authenticated`.
--
-- RLS de budgets, goals e goal_contributions já foi criado em
-- 20261004000000_init.sql (políticas *_own) — aqui só reafirmamos o enable.

alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

-- ---------------------------------------------------------------------------
-- budget_status(p_month): limite vs gasto por categoria de despesa
--   - inclui categorias com gasto e sem limite (limit_cents = null)
--   - inclui limites de categorias sem gasto no mês (spent_cents = 0)
-- ---------------------------------------------------------------------------
create or replace function public.budget_status(p_month date)
returns table (
  category_id uuid,
  category_name text,
  color text,
  limit_cents bigint,
  spent_cents bigint,
  remaining_cents bigint,
  percent_used numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as start_month,
           (date_trunc('month', p_month) + interval '1 month')::date as end_month
  ),
  spent as (
    select t.category_id,
           coalesce(sum(t.amount_cents), 0)::bigint as spent
    from public.transactions t
    cross join bounds b
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.category_id is not null
      and t.occurred_on >= b.start_month
      and t.occurred_on < b.end_month
    group by t.category_id
  ),
  base as (
    select c.id as category_id,
           c.name as category_name,
           c.color as color,
           b.limit_cents as limit_cents
    from public.categories c
    left join public.budgets b
      on b.category_id = c.id
     and b.user_id = c.user_id
     and b.month >= (select start_month from bounds)
     and b.month < (select end_month from bounds)
    where c.user_id = auth.uid()
      -- despesa com limite, ou despesa com gasto no mês, ou limite preso a
      -- categoria cujo tipo mudou (não pode sumir da tela)
      and (c.type = 'expense' or b.id is not null)
      and (b.id is not null or exists (select 1 from spent s where s.category_id = c.id))
  )
  select
    base.category_id,
    base.category_name,
    base.color,
    base.limit_cents::bigint,
    coalesce(spent.spent, 0)::bigint,
    (base.limit_cents - coalesce(spent.spent, 0))::bigint,
    case
      when base.limit_cents is null or base.limit_cents = 0 then null
      else round(100.0 * coalesce(spent.spent, 0) / base.limit_cents, 1)
    end
  from base
  left join spent on spent.category_id = base.category_id
  order by base.category_name asc;
$$;

-- ---------------------------------------------------------------------------
-- copy_budget(p_from, p_to): copia limites de um mês para outro.
--   Não sobrescreve limites já existentes no mês de destino.
--   Retorna a quantidade de limites copiados.
-- ---------------------------------------------------------------------------
create or replace function public.copy_budget(p_from date, p_to date)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  copied integer;
begin
  insert into public.budgets (user_id, category_id, month, limit_cents)
  select
    src.user_id,
    src.category_id,
    date_trunc('month', p_to)::date,
    src.limit_cents
  from public.budgets src
  where src.user_id = auth.uid()
    and src.month >= date_trunc('month', p_from)::date
    and src.month < (date_trunc('month', p_from) + interval '1 month')::date
    and not exists (
      select 1
      from public.budgets dest
      where dest.user_id = src.user_id
        and dest.category_id = src.category_id
        and dest.month >= date_trunc('month', p_to)::date
        and dest.month < (date_trunc('month', p_to) + interval '1 month')::date
    )
  on conflict (user_id, category_id, month) do nothing;

  get diagnostics copied = row_count;
  return coalesce(copied, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- goal_progress(): metas com progresso calculado
--   months_left = meses de calendário até o deadline (null sem prazo)
--   status vem junto para a UI pintar e alternar Ativa/Pausada/Concluída
-- ---------------------------------------------------------------------------
create or replace function public.goal_progress()
returns table (
  id uuid,
  name text,
  target_cents bigint,
  saved_cents bigint,
  remaining_cents bigint,
  percent numeric,
  deadline date,
  months_left integer,
  status text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.target_cents::bigint,
    g.saved_cents::bigint,
    greatest(g.target_cents - g.saved_cents, 0)::bigint,
    case
      when g.target_cents > 0 then round(100.0 * g.saved_cents / g.target_cents, 1)
      else 0::numeric
    end,
    g.deadline,
    case
      when g.deadline is null then null
      else greatest(
        (
          extract(year from age(date_trunc('month', g.deadline), date_trunc('month', current_date))) * 12
          + extract(month from age(date_trunc('month', g.deadline), date_trunc('month', current_date)))
        )::integer,
        0
      )
    end,
    g.status
  from public.goals g
  where g.user_id = auth.uid()
  order by
    case g.status when 'active' then 0 when 'paused' then 1 else 2 end,
    g.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: goal_contributions -> goals.saved_cents / status
--   Recalcula a soma (idempotente, não incrementa) para não acumular erro
--   em insert, update e delete. security invoker: o update em goals passa
--   pelo RLS, então só metas do próprio usuário mudam.
--   A soma limita-se a auth.uid(): a FK goal_id não respeita RLS, então sem
--   esse filtro um aporte de outro usuário apontando para a meta alheia
--   inflaria saved_cents da vítima.
--   status: saved >= target -> 'done'; era 'done' e caiu do alvo -> 'active'
--   ('paused' nunca muda sozinho).
-- ---------------------------------------------------------------------------
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

create or replace function public.handle_goal_contributions_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- trocou de meta: recalcula a antiga e a nova
  if tg_op = 'UPDATE' and new.goal_id is distinct from old.goal_id then
    perform public.refresh_goal_progress(old.goal_id);
  end if;

  perform public.refresh_goal_progress(coalesce(new.goal_id, old.goal_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_goal_contributions_changed on public.goal_contributions;
create trigger on_goal_contributions_changed
  after insert or update or delete on public.goal_contributions
  for each row execute function public.handle_goal_contributions_change();

-- ---------------------------------------------------------------------------
-- Políticas mais estritas em goal_contributions: a FK goal_id não valida o
-- dono (RLS não é aplicado em checagem de FK), então exigimos que a meta seja
-- do usuário também no insert e no update.
-- ---------------------------------------------------------------------------
drop policy if exists "goal_contributions_insert_own" on public.goal_contributions;
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = (select auth.uid())
    )
  );

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

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index if not exists goal_contributions_user_goal_idx
  on public.goal_contributions (user_id, goal_id);

-- ---------------------------------------------------------------------------
-- Privilégios: só usuário autenticado executa
-- ---------------------------------------------------------------------------
revoke all on function public.budget_status(date) from public, anon;
revoke all on function public.copy_budget(date, date) from public, anon;
revoke all on function public.goal_progress() from public, anon;
revoke all on function public.refresh_goal_progress(uuid) from public, anon;
revoke all on function public.handle_goal_contributions_change() from public, anon;

grant execute on function public.budget_status(date) to authenticated;
grant execute on function public.copy_budget(date, date) to authenticated;
grant execute on function public.goal_progress() to authenticated;
grant execute on function public.refresh_goal_progress(uuid) to authenticated;
grant execute on function public.handle_goal_contributions_change() to authenticated;
