# Plano de Desenvolvimento — App de Organização Financeira

Stack: **Next.js (App Router) + React + TypeScript + Supabase (Postgres, Auth, RLS)**

---

## 0. Mudanças em relação ao seu pedido (APROVAR ANTES DE COMEÇAR)

| # | Mudança / adição | Motivo |
|---|---|---|
| M1 | Usar **Supabase Auth** para login (e-mail/senha + Google) | Já vem pronto com o Supabase, integra com RLS, zero código de auth próprio |
| M2 | Usar **Row Level Security (RLS)** em todas as tabelas | Cada usuário só vê os próprios dados; segurança sem backend extra |
| M3 | Gráficos com **shadcn/ui Charts (Recharts)** | Biblioteca pronta, rápida de implementar |
| M4 | Assistente de IA via **NVIDIA NIM (build.nvidia.com)**, API gratuita compatível com OpenAI, usando **Vercel AI SDK** com `@ai-sdk/openai-compatible` (baseURL `https://integrate.api.nvidia.com/v1`) | Você escolheu NVIDIA. API pronta e sem SDK próprio. O plano gratuito tem limite de requisições (relatado como ~40/min por modelo; seu limite real aparece no painel do build.nvidia.com), e a documentação deles é a fonte oficial para conferir créditos e regras |
| M4b | A IA **não lê o banco inteiro**: o código calcula estatísticas e envia só um resumo agregado para o modelo | Mais barato, mais rápido, mais preciso nos números e mais privado |
| M5 | Cálculos financeiros (totais, diferenças, % do orçamento) feitos em **SQL views/funções**, não pela IA | A IA erra conta; o banco não |
| M6 | Valores monetários guardados como **inteiro em centavos** | Evita erro de ponto flutuante |
| M7 | Importação de extrato **CSV** como fase opcional (Fase 6) | Acelera o uso real; Open Finance fica fora do escopo inicial |

> Nada além disso foi alterado. As 3 seções e todas as funções que você listou estão mantidas.

---

## 1. Regras para o agente de IA local (colar no CLAUDE.md / prompt de sistema)

1. Sempre **preferir bibliotecas e APIs prontas** a código próprio.
2. Ao usar qualquer biblioteca/API/serviço, **citar no final da tarefa**: nome, versão, para que foi usada e link da documentação.
3. **Não mudar o plano** sem avisar: listar a mudança, o motivo e esperar aprovação.
4. TypeScript estrito, sem `any`. Validação com **Zod** nas entradas.
5. Uma fase por vez; ao terminar, rodar `lint`, `tsc` e testar o critério de aceite da fase.
6. Nunca expor `SUPABASE_SERVICE_ROLE_KEY` nem a chave da IA no client. Chave da IA só em Route Handler/Server Action.
7. Textos da interface em **pt-BR**, moeda **BRL** (`Intl.NumberFormat`).

### Bibliotecas previstas (todas já existentes)
- `@supabase/supabase-js`, `@supabase/ssr` — banco e auth
- Supabase CLI — migrations versionadas
- `shadcn/ui` + Tailwind CSS — componentes
- `recharts` (via shadcn charts) — gráficos
- `react-hook-form` + `zod` — formulários e validação
- `@tanstack/react-query` — cache e mutações
- `date-fns` — datas
- `ai` (Vercel AI SDK) + `@ai-sdk/openai-compatible` — assistente conectado à NVIDIA NIM (`https://integrate.api.nvidia.com/v1`)
- Chave da NVIDIA (`nvapi-...`) gerada em build.nvidia.com, guardada em `NVIDIA_API_KEY` (somente servidor)
- `@upstash/ratelimit` (opcional) — limitar mensagens por usuário
- `papaparse` — importação CSV (Fase 6)
- `vitest` — testes dos cálculos

---

## 2. Modelo de dados (Supabase / Postgres)

Todas as tabelas têm `user_id uuid references auth.users` e RLS: `user_id = auth.uid()`.

```sql
-- categorias (receita ou despesa)
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  kind text check (kind in ('fixed','variable','essential','non_essential')), -- classificação da despesa
  color text,
  created_at timestamptz default now()
);

-- transações (receitas e despesas)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid references categories(id),
  type text not null check (type in ('income','expense')),
  amount_cents integer not null check (amount_cents > 0),
  description text,
  occurred_on date not null,
  is_recurring boolean default false,
  created_at timestamptz default now()
);

-- orçamento mensal por categoria
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null references categories(id),
  month date not null,               -- sempre dia 1 do mês
  limit_cents integer not null,
  unique (user_id, category_id, month)
);

-- metas financeiras
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  target_cents integer not null,
  saved_cents integer not null default 0,
  deadline date,
  status text default 'active' check (status in ('active','done','paused')),
  created_at timestamptz default now()
);

-- aportes nas metas (plano de poupança)
create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  amount_cents integer not null,
  contributed_on date not null
);

-- histórico de conversas da IA (opcional)
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);
```

**Views/funções (M5):**
- `monthly_summary(month)` → total receitas, total despesas, saldo
- `expenses_by_category(month)` → total por categoria e por `kind`
- `budget_status(month)` → limite, gasto, % usado, restante por categoria
- `monthly_series(n_months)` → série histórica para gráficos

---

## 3. Fases de desenvolvimento

### Fase 1 — Fundação
- Criar projeto Next.js + TS + Tailwind + shadcn/ui
- Criar projeto Supabase, configurar `.env.local`
- Migrations das tabelas + políticas RLS
- Auth (cadastro, login, logout, middleware de rota protegida) com `@supabase/ssr`
- Layout base com sidebar: Painel · Transações · Orçamentos · Metas · Assistente
- Seed automático de categorias padrão ao criar usuário (trigger)

**Aceite:** dois usuários diferentes não enxergam os dados um do outro.

### Fase 2 — Seção 1: Mapeamento de receitas e despesas
- **Identificar receitas:** CRUD de transações do tipo `income` (com recorrência opcional)
- **Listar despesas:** tabela com filtros (mês, categoria, tipo, busca), paginação e ordenação
- **Classificar despesas:** categoria + `kind` (fixa/variável, essencial/não essencial); editar em lote
- **Calcular diferença:** cartões no topo (Receitas, Despesas, Saldo) via `monthly_summary`
- **Gráficos:**
  - Barras: receitas vs despesas por mês (últimos 6–12 meses)
  - Rosca/pizza: despesas por categoria no mês
  - Linha: saldo ao longo do tempo

**Aceite:** cadastrar 20 transações e os totais e gráficos baterem com a soma manual.

### Fase 3 — Seção 2: Orçamentos
- **Estabelecer metas financeiras:** CRUD de `goals` com barra de progresso e prazo
- **Comparar receitas e despesas:** tela de orçamento mensal com limite por categoria vs gasto real (`budget_status`), cores verde/amarelo/vermelho
- **Ajustar despesas:** editar limites inline; botão "copiar orçamento do mês anterior"
- **Plano de poupança:** a partir de uma meta (valor + prazo), calcular o aporte mensal necessário e comparar com o saldo médio livre; registrar aportes em `goal_contributions`
- **Monitorar e ajustar:** alertas na interface quando uma categoria passa de 80% e 100% do limite; projeção de fim de mês (gasto atual ÷ dias passados × dias do mês)

**Aceite:** meta de R$ 6.000 em 12 meses mostra aporte de R$ 500/mês; alerta aparece ao cruzar 80%.

### Fase 4 — Seção 3: Assistente de IA gratuito
Arquitetura:
1. Usuário envia mensagem em `/assistente`
2. Route Handler (`/api/assistant`) busca **resumos agregados** (últimos 3–6 meses por categoria, orçamento, metas, saldo, recorrentes)
3. Monta o prompt de sistema com esses dados + regras (abaixo) e chama o modelo da NVIDIA via Vercel AI SDK (`createOpenAICompatible`) com **streaming**
   - Modelo definido em variável `NVIDIA_MODEL` (trocar sem mexer no código). Escolher um modelo de chat que fale bem português e **teste 2–3 no catálogo** (o agente deve listar com `GET /v1/models` e comparar)
   - Camada `lib/ai/provider.ts` isolada: se a NVIDIA mudar limites ou modelos, troca-se só esse arquivo
4. Salva histórico em `ai_messages`

Capacidades pedidas:
- **Identificar padrões de gastos:** detectar categorias com crescimento mês a mês, dias da semana de maior gasto, gastos pequenos recorrentes (calculado em código, a IA só explica)
- **Prevenir dívidas:** avisar quando a projeção de fim de mês ultrapassa a receita, quando despesas fixas passam de um percentual da renda, ou quando o saldo fica negativo por meses seguidos
- **Alcançar metas:** sugerir cortes específicos e aportes baseados nas metas ativas
- **Adaptar-se a mudanças:** recalcular com a renda/gastos mais recentes (ex.: perdeu renda, nova despesa fixa) e propor orçamento revisado
- **Hábitos financeiros saudáveis:** dicas curtas e acionáveis (regra 50/30/20, reserva de emergência, revisão semanal)
- Botões de ações rápidas: "Analisar meu mês", "Onde posso economizar?", "Estou no caminho da minha meta?"

Regras do prompt de sistema:
- Responder em pt-BR, tom prático e sem julgamento
- Usar **apenas** os números fornecidos; se faltar dado, dizer que falta
- Não dar recomendação de investimento específico; é educação financeira, não consultoria
- Limitar tamanho da resposta; terminar com 1 ação concreta

Proteções: como o limite gratuito da NVIDIA é compartilhado entre todos os seus usuários (por chave), implementar limite de mensagens por usuário/dia (tabela ou Upstash Ratelimit), fila/retry com *backoff* para erro 429, mensagem amigável quando a cota acabar, e nunca enviar nome/e-mail do usuário ao modelo. Cachear a análise mensal em `ai_messages` para não gastar requisição repetida.

**Aceite:** com dados de teste, o assistente cita corretamente a categoria que mais cresceu e o valor.

### Fase 5 — Polimento e deploy
- Estados vazios, loading skeletons, mensagens de erro
- Responsivo (mobile primeiro) e modo escuro
- Testes (`vitest`) das funções de cálculo (aporte mensal, projeção, % do orçamento)
- Deploy: **Vercel** (front) + Supabase (banco); variáveis de ambiente configuradas
- README com setup e checklist de segurança (RLS ativo em todas as tabelas)

### Fase 6 — Opcional (só com sua aprovação)
- Importar extrato CSV com `papaparse` + mapeamento de colunas + auto-categorização por palavras-chave
- Exportar relatório mensal em PDF/CSV
- PWA para instalar no celular

---

## 4. Ordem de execução sugerida para o agente

1. Fase 1 inteira → validar RLS
2. Fase 2 → validar totais
3. Fase 3 → validar cálculos
4. Fase 4 → validar IA com dados de teste
5. Fase 5 → deploy

A cada fase, o agente entrega: código, migrations, lista de bibliotecas/APIs usadas (citadas) e como testar.

## 5. Primeiro prompt para o agente

> Leia este plano completo. Execute somente a **Fase 1**. Siga as regras da seção 1: use bibliotecas prontas e cite cada uma ao final, e me avise de qualquer mudança no plano antes de fazê-la. Ao terminar, rode lint e typecheck e me diga como validar o critério de aceite.
