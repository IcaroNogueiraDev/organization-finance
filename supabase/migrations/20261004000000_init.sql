-- Fase 1: tabelas + RLS + seed de categorias padrão
-- Conforme PLANO.md (Seção 2). Valores monetários em centavos (inteiro).

-- ---------------------------------------------------------------------------
-- categorias (receita ou despesa)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  kind text check (kind in ('fixed', 'variable', 'essential', 'non_essential')),
  color text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- transações (receitas e despesas)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid references public.categories (id),
  type text not null check (type in ('income', 'expense')),
  amount_cents integer not null check (amount_cents > 0),
  description text,
  occurred_on date not null,
  is_recurring boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- orçamento mensal por categoria
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null references public.categories (id),
  month date not null, -- sempre dia 1 do mês
  limit_cents integer not null,
  unique (user_id, category_id, month)
);

-- ---------------------------------------------------------------------------
-- metas financeiras
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  target_cents integer not null,
  saved_cents integer not null default 0,
  deadline date,
  status text default 'active' check (status in ('active', 'done', 'paused')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- aportes nas metas (plano de poupança)
-- ---------------------------------------------------------------------------
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  amount_cents integer not null,
  contributed_on date not null
);

-- ---------------------------------------------------------------------------
-- histórico de conversas da IA
-- ---------------------------------------------------------------------------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- índices
-- ---------------------------------------------------------------------------
create index categories_user_type_idx on public.categories (user_id, type);
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_type_idx on public.transactions (user_id, type);
create index budgets_user_month_idx on public.budgets (user_id, month);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);
create index ai_messages_user_created_idx on public.ai_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (M2): cada usuário só vê os próprios dados
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.ai_messages enable row level security;

create policy "categories_select_own" on public.categories
  for select using (user_id = (select auth.uid()));
create policy "categories_insert_own" on public.categories
  for insert with check (user_id = (select auth.uid()));
create policy "categories_update_own" on public.categories
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "categories_delete_own" on public.categories
  for delete using (user_id = (select auth.uid()));

create policy "transactions_select_own" on public.transactions
  for select using (user_id = (select auth.uid()));
create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = (select auth.uid()));
create policy "transactions_update_own" on public.transactions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transactions_delete_own" on public.transactions
  for delete using (user_id = (select auth.uid()));

create policy "budgets_select_own" on public.budgets
  for select using (user_id = (select auth.uid()));
create policy "budgets_insert_own" on public.budgets
  for insert with check (user_id = (select auth.uid()));
create policy "budgets_update_own" on public.budgets
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "budgets_delete_own" on public.budgets
  for delete using (user_id = (select auth.uid()));

create policy "goals_select_own" on public.goals
  for select using (user_id = (select auth.uid()));
create policy "goals_insert_own" on public.goals
  for insert with check (user_id = (select auth.uid()));
create policy "goals_update_own" on public.goals
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goals_delete_own" on public.goals
  for delete using (user_id = (select auth.uid()));

create policy "goal_contributions_select_own" on public.goal_contributions
  for select using (user_id = (select auth.uid()));
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (user_id = (select auth.uid()));
create policy "goal_contributions_update_own" on public.goal_contributions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goal_contributions_delete_own" on public.goal_contributions
  for delete using (user_id = (select auth.uid()));

create policy "ai_messages_select_own" on public.ai_messages
  for select using (user_id = (select auth.uid()));
create policy "ai_messages_insert_own" on public.ai_messages
  for insert with check (user_id = (select auth.uid()));
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
