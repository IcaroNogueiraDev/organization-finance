-- Fase 2: funções de agregação (security invoker, filtram por auth.uid) + índices
-- Aplicar no SQL Editor do Supabase ou via `supabase db push` (após `supabase login`).

-- ---------------------------------------------------------------------------
-- Índices pedidos na Fase 2
-- ---------------------------------------------------------------------------
drop index if exists public.transactions_user_occurred_idx;
create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_on);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

-- ---------------------------------------------------------------------------
-- monthly_summary: totais do mês
-- ---------------------------------------------------------------------------
create or replace function public.monthly_summary(p_month date)
returns table (
  total_income_cents bigint,
  total_expense_cents bigint,
  balance_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint
      as total_income_cents,
    coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint
      as total_expense_cents,
    (
      coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)
    )::bigint as balance_cents
  from public.transactions t
  where t.user_id = auth.uid()
    and t.occurred_on >= p_month
    and t.occurred_on < (p_month + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------------
-- expenses_by_category: despesas do mês por categoria (com percentual)
-- ---------------------------------------------------------------------------
create or replace function public.expenses_by_category(p_month date)
returns table (
  category_id uuid,
  category_name text,
  color text,
  kind text,
  total_cents bigint,
  percent numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with monthly as (
    select t.amount_cents, t.category_id
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.occurred_on >= p_month
      and t.occurred_on < (p_month + interval '1 month')::date
  ),
  totals as (
    select
      m.category_id,
      coalesce(c.name, 'Sem categoria') as category_name,
      c.color,
      c.kind,
      sum(m.amount_cents)::bigint as total_cents
    from monthly m
    left join public.categories c
      on c.id = m.category_id and c.user_id = auth.uid()
    group by m.category_id, c.name, c.color, c.kind
  )
  select
    t.category_id,
    t.category_name,
    t.color,
    t.kind,
    t.total_cents,
    case
      when coalesce(sum(t.total_cents) over (), 0) = 0 then 0
      else round(100.0 * t.total_cents / sum(t.total_cents) over (), 1)
    end as percent
  from totals t
  order by t.total_cents desc
$$;

-- ---------------------------------------------------------------------------
-- monthly_series: últimos N meses (inclui meses sem movimento = 0)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_series(p_months int)
returns table (
  month date,
  income_cents bigint,
  expense_cents bigint,
  balance_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('month', current_date)
        - make_interval(months => greatest(p_months, 1) - 1))::date as start_month,
      date_trunc('month', current_date)::date as end_month
  ),
  months as (
    select generate_series(
      (select start_month from bounds),
      (select end_month from bounds),
      interval '1 month'
    )::date as month
  ),
  agg as (
    select
      date_trunc('month', t.occurred_on)::date as month,
      coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint
        as income_cents,
      coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint
        as expense_cents
    from public.transactions t
    cross join bounds b
    where t.user_id = auth.uid()
      and t.occurred_on >= b.start_month
      and t.occurred_on < (b.end_month + interval '1 month')::date
    group by 1
  )
  select
    m.month,
    coalesce(a.income_cents, 0)::bigint as income_cents,
    coalesce(a.expense_cents, 0)::bigint as expense_cents,
    (coalesce(a.income_cents, 0) - coalesce(a.expense_cents, 0))::bigint
      as balance_cents
  from months m
  left join agg a on a.month = m.month
  order by m.month
$$;

-- ---------------------------------------------------------------------------
-- Privilégios: só usuário autenticado autenticado executa
-- ---------------------------------------------------------------------------
revoke all on function public.monthly_summary(date) from public, anon;
revoke all on function public.expenses_by_category(date) from public, anon;
revoke all on function public.monthly_series(int) from public, anon;

grant execute on function public.monthly_summary(date) to authenticated;
grant execute on function public.expenses_by_category(date) to authenticated;
grant execute on function public.monthly_series(int) to authenticated;
