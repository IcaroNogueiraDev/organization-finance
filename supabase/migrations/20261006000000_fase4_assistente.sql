-- Fase 4: assistente de IA — limite diário por usuário e cache da análise mensal
-- Conforme PLANO.md (Seção 3 — Fase 4): "limite de mensagens por usuário/dia
-- (tabela ...)" e "cachear a análise mensal em ai_messages".
--
-- * ai_usage_daily: consumo por usuário/dia. RLS habilitado SEM políticas e
--   privilégios revogados de anon/authenticated: o cliente só enxerga a própria
--   contagem pelas funções security definer abaixo (que usam auth.uid()).
-- * consume_ai_message(): incremento atômico com teto diário (constante 20);
--   só incrementa enquanto messages < teto, então nunca passa do limite mesmo
--   com requisições concorrentes.
-- * ai_usage(): leitura do consumo do dia sem consumir cota (para a UI).
-- * ai_messages.analysis_month: cache da "análise do mês" — um assistant
--   por (user_id, analysis_month), garantido por índice único parcial.
--
-- Data/hora do dia: current_date no fuso do servidor (São Paulo no Supabase).

-- ---------------------------------------------------------------------------
-- Consumo diário (tabela sem acesso direto do cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  messages integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage_daily enable row level security;

revoke all on public.ai_usage_daily from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- consume_ai_message(): reserva 1 mensagem da cota do dia
--   Retorna allowed (pode enviar agora), used (mensagens já usadas hoje)
--   e daily_limit (teto). security definer: a tabela não tem políticas;
--   o usuário é sempre auth.uid(), não há parâmetro para alheios.
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_message()
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 20;
  v_used integer;
begin
  if (select auth.uid()) is null then
    return query select false, 0, v_limit;
    return;
  end if;

  -- on conflict + where: se já bateu o teto, nada é incrementado
  -- e nenhum row é retornado (v_used fica null).
  insert into public.ai_usage_daily as u (user_id, day, messages)
  values ((select auth.uid()), current_date, 1)
  on conflict (user_id, day) do update
     set messages = u.messages + 1
   where u.messages < v_limit
  returning u.messages into v_used;

  if v_used is null then
    select u.messages into v_used
      from public.ai_usage_daily u
     where u.user_id = (select auth.uid())
       and u.day = current_date;
    return query select false, coalesce(v_used, v_limit), v_limit;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_usage(): consumo do dia sem reservar cota (UI mostra "X de 20 hoje")
-- ---------------------------------------------------------------------------
create or replace function public.ai_usage()
returns table (used integer, daily_limit integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select u.messages
         from public.ai_usage_daily u
        where u.user_id = (select auth.uid())
          and u.day = current_date),
      0
    )::integer,
    20::integer;
$$;

-- ---------------------------------------------------------------------------
-- Cache da análise mensal em ai_messages
--   Só a resposta (assistant) carrega analysis_month; as mensagens do usuário
--   ficam com null e não disputam o índice único parcial.
-- ---------------------------------------------------------------------------
alter table public.ai_messages
  add column if not exists analysis_month date;

create unique index if not exists ai_messages_user_analysis_month_idx
  on public.ai_messages (user_id, analysis_month)
  where analysis_month is not null;

-- ---------------------------------------------------------------------------
-- Privilégios: só usuário autenticado executa (anon/public ficam de fora)
-- ---------------------------------------------------------------------------
revoke all on function public.consume_ai_message() from public, anon;
revoke all on function public.ai_usage() from public, anon;

grant execute on function public.consume_ai_message() to authenticated;
grant execute on function public.ai_usage() to authenticated;
