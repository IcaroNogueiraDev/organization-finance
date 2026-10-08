# Org Finance

App de organização financeira: receitas, despesas, orçamentos, metas e assistente de IA.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind CSS v4 · shadcn/ui · TanStack Query · Supabase (Postgres, Auth, RLS)

Plano de desenvolvimento completo em [`PLANO.md`](./PLANO.md). Regras para agentes em [`AGENTS.md`](./AGENTS.md).

---

## 1. Rodar localmente

```bash
npm install
# preencha o .env.local já existente na raiz (placeholders vindos de .env.example)
npm run dev
```

Scripts: `npm run dev` · `npm run build` · `npm run lint` · `npm test` · `npx tsc --noEmit`.

## 2. Configurar o Supabase

1. Crie o projeto em [database.new](https://database.new) (plano gratuito).
2. Em **Project Settings → API**, copie a **Project URL** e a **Publishable key** (`sb_publishable_...`) para o `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
3. Aplique as migrations. Escolha um caminho:

   **Opção A — Supabase CLI (recomendada):**
   ```bash
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

   **Opção B — SQL Editor:** cole e rode, nesta ordem, os arquivos de
   `supabase/migrations/`:
   - `20261004000000_init.sql` (tabelas + RLS + categorias padrão) — *já aplicado*
   - `20261004120000_fase2_funcoes.sql` (funções de agregação + índices) — **Fase 2**

   > Se usar o SQL Editor, depois marque as migrations como aplicadas para futuros
   > `supabase db push`: `supabase migration repair --status applied <versão>`.

4. **E-mail/senha:** em **Authentication → Providers → Email**, mantenha ativo.

5. **Google (opcional, para o botão "Entrar com Google"):**
   - Em [Google Cloud Console](https://console.cloud.google.com/) crie credenciais OAuth 2.0 (tipo *Web application*).
   - **Authorized redirect URI:** `https://SEU-PROJETO.supabase.co/auth/v1/callback`
   - No Supabase: **Authentication → Providers → Google** → ative, cole Client ID e Secret.
   - Em **Authentication → URL Configuration**: defina **Site URL** como `http://localhost:3000` (e depois a URL de produção) e adicione `http://localhost:3000` em **Redirect URLs**.

## 3. Tipos TypeScript do banco

`src/lib/database.types.ts` está **escrito à mão** (equivalente ao schema das
migrations). Com o CLI logado, gere o oficial e substitua o arquivo:

```bash
npx supabase gen types typescript --project-ref SEU_PROJECT_REF > src/lib/database.types.ts
npx tsc --noEmit
```

## 4. Validar a Fase 1

> Dois usuários diferentes não enxergam os dados um do outro.

1. Cadastre o usuário **A** (`/cadastro`), confirme o e-mail e entre.
2. Faça logout e cadastre o usuário **B**.
3. Com B logado, nada criado por A aparece (RLS `user_id = auth.uid()` em todas as tabelas).

## 5. Validar a Fase 2 (critérios de aceite)

> Resultado completo da última validação em [`TESTS.md`](./TESTS.md) (27 verificações automatizadas, todas verdes).

**Seed de teste:** rode `supabase/seed_fase2.sql` no SQL Editor — cria
`seed-a@orgfinance.dev` / `seed-b@orgfinance.dev` (senha `SeedFase2!2026`),
20 transações de A em ago/set/out 2026 e 3 de B. Alternativa pela API:
`npm run seed:fase2`.

**Verificação automatizada:** `npm run verify:fase2` (cartões, gráficos,
filtros, paginação e isolamento A/B contra o banco real).

**1. Cadastrar 20 transações em 3 meses e conferir cartões e gráficos:**
1. Crie receitas e despesas em 3 meses diferentes (selecione o mês no topo de `/transacoes` e use "Nova transação").
2. Abra `/painel`, escolha o mesmo mês no seletor e some manualmente: receitas − despesas = saldo do cartão.
3. Repita para os 3 meses e confira que o gráfico de barras de cada mês bate com as suas contas.

**2. Mês sem transações aparece com zero:**
1. Navegue o seletor de mês até um mês sem lançamentos.
2. Cartões mostram `R$ 0,00`, o gráfico de rosca mostra "Sem despesas no mês" e o gráfico de linha/barras mantém o mês com valor 0 (função `monthly_series` gera a série completa).

**3. Usuário B não vê nem altera transações do usuário A:**
1. Com a conta A, anote o link/id de uma transação (ou crie algumas).
2. Entre com a conta B: `/transacoes` mostra apenas as de B.
3. Tente editar/excluir via app com a conta B apontando para id de A → "Transação não encontrada" (RLS).

**4. Filtros e paginação combinados:**
1. Cadastre mais de 20 transações no mesmo mês → paginação aparece (20 por página).
2. Combine: mês + aba Receitas/Despesas + categoria + classificação + busca.
3. A contagem ("X transação(ões) no mês") e a paginação refletem a combinação.
4. Marque várias linhas e use "Aplicar" para trocar a categoria em lote.

## 6. Estrutura

```
src/
  proxy.ts                       # Next.js 16: proteção de rotas (antes middleware.ts)
  lib/
    supabase/                    # clientes: client (browser), server, proxy
    actions/                     # Server Actions (auth, transactions, categories, dashboard)
    schemas/                     # validação Zod (auth, transaction, category)
    finance/                     # moeda (centavos), datas, agrupamento (+ testes)
    database.types.ts            # tipos do banco
  components/
    painel/                      # cartões + gráficos (Recharts/shadcn charts)
    transactions/                # tabela com filtros + diálogo do formulário
    categories/                  # CRUD de categorias
    auth/, ui/, month-picker...  # shadcn ui + auxiliares
  app/
    (auth)/login, cadastro       # telas públicas
    (app)/painel, transacoes, categorias, orcamentos, metas, assistente
    auth/callback                # retorno do OAuth (PKCE)
supabase/migrations/             # SQL versionado
```

## 7. Segurança

- RLS habilitado em **todas** as tabelas, com `user_id = auth.uid()`.
- Funções SQL em `security invoker` + `user_id = auth.uid()` (respeitam o RLS).
- Nenhuma chave secreta no client: só `NEXT_PUBLIC_*` chega ao navegador.
- `SUPABASE_SECRET_KEY`/`NVIDIA_API_KEY` ficam apenas em Route Handlers/Server Actions (a partir da Fase 4).
- `.env.local` está no `.gitignore`; `.env.example` é versionado com placeholders.
