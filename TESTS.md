# TESTS — Resultados da validação (Fases 2 e 3)

Data: 04/10/2026 · Projeto: `org-finance` · Supabase: `dppgyaaqnjoakdeqbnoz`

| Item | Valor |
|---|---|
| Runtime | Node 24.16 · npm 11 · Next.js 16.3.8 · React 19.2.8 |
| Banco | Supabase (Postgres + Auth + RLS), migrations versionadas em `supabase/migrations/` |
| Seed | `supabase/seed_fase2.sql` → 2 usuários, 24 categorias, 23 transações |

---

## 1. Gates de código

| Comando | Resultado |
|---|---|
| `npm run lint` (eslint) | ✅ 0 erros, 0 avisos |
| `npx tsc --noEmit` | ✅ 0 erros (TS estrito) |
| `npm test` (vitest 5.0.3) | ✅ 2 arquivos, **14/14 testes** (moeda/centavos, datas, agrupamento por mês) |
| `npm run build` | ✅ compila + 13 páginas geradas; rotas dinâmicas `/painel`, `/transacoes`, `/categorias`, `/orcamentos`, `/metas`, `/assistente`, `/auth/callback`; `Proxy (Middleware)` ativo |

## 2. Seed de teste

Arquivo: `supabase/seed_fase2.sql` (idempotente, roda no SQL Editor).

| Conta | Senha | Dados |
|---|---|---|
| `seed-a@orgfinance.dev` | `SeedFase2!2026` | **20 transações** em ago/set/out 2026 + 12 categorias |
| `seed-b@orgfinance.dev` | `SeedFase2!2026` | **3 transações** (set/out 2026) + 12 categorias (isolamento RLS) |

Totais gravados (centavos):

| Mês (A) | Receita | Despesa | Saldo | Linhas |
|---|---:|---:|---:|---:|
| 2026-08 | 430.000 | 193.400 | 236.600 | 7 |
| 2026-09 | 350.000 | 209.590 | 140.410 | 7 |
| 2026-10 | 395.000 | 176.000 | 219.000 | 6 |
| **Total A** | **1.175.000** | **578.990** | **596.010** | **20** (5 receitas + 15 despesas) |
| **Total B** | **100.000** | **80.000** | **20.000** | **3** |

1.175.000 centavos = R$ 11.750,00 · 578.990 = R$ 5.789,90 · saldo R$ 5.960,10.

## 3. Verificação automatizada contra o banco real

`npm run verify:fase2` → **27 verificações: 27 PASS, 0 FAIL**

| # | Verificação | Esperado | Obtido |
|---|---|---|---|
| 1 | Login seed-a | sessão | ✅ sessão |
| 2 | Login seed-b | sessão | ✅ sessão |
| 3 | Total de transações de A | 20 | ✅ 20 |
| 4 | Linhas por mês | 7 / 7 / 6 | ✅ 7 / 7 / 6 |
| 5 | `monthly_summary(2026-08)` | 430000 / 193400 / 236600 | ✅ igual |
| 6 | `monthly_summary(2026-09)` | 350000 / 209590 / 140410 | ✅ igual |
| 7 | `monthly_summary(2026-10)` | 395000 / 176000 / 219000 | ✅ igual |
| 8 | Cartões = soma manual das 20 linhas | 1175000 / 578990 / 596010 | ✅ igual |
| 9 | `monthly_series(6)` = 6 meses | 2026-05…2026-10 | ✅ igual |
| 10 | Meses sem movimento = zero | 05/06/07 → 0/0/0 | ✅ zero |
| 11 | Série (2026-10) = resumo do mês | 395000 / 176000 / 219000 | ✅ igual |
| 12 | `expenses_by_category(2026-10)` total e nº | 4 categorias, 176000 | ✅ 4, 176000 |
| 13 | Topo da rosca | Moradia 120000, 68,2% | ✅ Moradia 120000, 68,2% |
| 14 | Percentuais somam ~100 | ~100 | ✅ 100,0 |
| 15 | Transação sem categoria → "Sem categoria" | 12000 (2026-08) | ✅ 12000 |
| 16 | Filtro `type=expense` | 15 | ✅ 15 |
| 17 | Filtro categoria Moradia | 3 | ✅ 3 |
| 18 | Busca "Supermercado" | 1 | ✅ 1 |
| 19 | Filtro combinado (2026-09 + despesas) | 6 | ✅ 6 |
| 20 | Paginação pág. 1 (20/página) | 20 linhas, count 20 | ✅ 20/20 |
| 21 | Paginação pág. 2 | vazia | ✅ 0 |
| 22 | B vê apenas as próprias transações | 3 | ✅ 3 |
| 23 | B não vê nenhuma linha de A | 0 | ✅ 0 |
| 24 | Leitura direta por id de A, como B | 0 | ✅ 0 |
| 25 | Update de A bloqueado para B (RLS) | 0 linhas | ✅ 0 |
| 26 | A continua vendo a própria linha | 1 | ✅ 1 |
| 27 | Categorias: 12 para cada usuário | a=12, b=12 | ✅ 12/12 |

## 4. Critérios de aceite da Fase 2 (PLANO.md)

| Critério | Status | Evidência |
|---|---|---|
| 1. Cadastrar 20 transações em 3 meses e conferir cartões e gráficos | ✅ | Verificações 3–8 e 12–14: soma manual = cartões = série do gráfico; rosca de 2026-10 fecha em 176.000 centavos |
| 2. Mês sem transações aparece com zero | ✅ | Verificações 9–11: 2026-05/06/07 zerados na série; cartões do mês vazio retornam 0 |
| 3. Usuário B não vê nem altera transações de A | ✅ | Verificações 22–26: select, select por id e update retornam 0 linhas para B |
| 4. Filtros e paginação combinados | ✅ | Verificações 16–21: tipo + categoria + busca + combinação de mês/tipo + paginação 20/página |

## 5. Achados durante a validação (corrigidos)

1. **Fase 1 aplicada parcialmente** — a migration `20261004000000_init.sql` parou após o `enable row security`: `diag_all()` retornou `policies: []` e `handle_new_user_existe: false`. Sem políticas, todo select vinha vazio e todo insert era negado (`42501`), o que fazia o critério de isolamento da Fase 1 parecer "ok" sem sentido.
   → Corrigido por `supabase/fix_fase1_policies.sql` (23 políticas + função/trigger `on_auth_user_created`, idempotente).
2. **Login 500 `Database error querying schema`** — INSERT direto em `auth.users` deixava `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new/_current`, `phone_change(_token)` e `reauthentication_token` como `NULL`; o GoTrue exige `''`.
   → Corrigido no seed. Refs: [troubleshooting oficial](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44), [supabase/auth#1940](https://github.com/supabase/auth/issues/1940).
3. **SQL Editor executa o script inteiro em uma transação** — erro na última query desfez o seed inteiro (causa da rolagem v1→v3). Corrigido no relatório final (`group by u.id`).
4. **Contas reais criadas antes da correção não têm categorias** — o trigger `on_auth_user_created` não existia. Recomendação: apagar e recadastrar essas contas (ou rodar o bloco de categorias do seed para os ids delas).
5. **Funções de diagnóstico** `public.test_uid()` e `public.diag_all()` foram criadas durante o troubleshooting → remover com `supabase/cleanup_diag.sql`.

## 6. Como reproduzir

```bash
npm install
npm run lint && npx tsc --noEmit && npm test && npm run build
npm run seed:fase2     # seed pela API (alternativa ao SQL), se preferir
npm run verify:fase2   # 27 verificações contra o banco real
```

No SQL Editor (ordem): `20261004000000_init.sql` → `20261004120000_fase2_funcoes.sql` → `fix_fase1_policies.sql` → `seed_fase2.sql` → (ao final) `cleanup_diag.sql`.

## 7. Pendências

- [ ] Rodar `supabase/cleanup_diag.sql` (remove `test_uid`, `diag_all`).
- [ ] Marcar as migrations manualmente aplicadas antes de um `supabase db push`: `supabase migration repair --status applied <versão>`.
- [ ] Gerar os tipos oficiais quando o CLI estiver logado: `npx supabase gen types typescript --project-ref dppgyaaqnjoakdeqbnoz > src/lib/database.types.ts`.
- [ ] Validar visualmente no navegador (`/painel`, `/transacoes`, `/categorias`) com a conta `seed-a`.
- [ ] Remover os usuários seed antes de ir para produção: `delete from auth.users where email like 'seed-%@orgfinance.dev';`.

## 8. Bibliotecas citadas

| Biblioteca | Versão | Uso nesta validação | Doc |
|---|---|---|---|
| vitest | 5.0.3 | 14 testes unitários (moeda, datas, agrupamento) | https://vitest.dev |
| @supabase/supabase-js | 2.117.2 | login + PostgREST + `rpc()` no `verify-fase2.mjs` e `seed-fase2-api.mjs` | https://supabase.com/docs/reference/javascript |
| Node.js `fetch`/`node:fs` | 24.16 | carga do `.env.local` e chamadas HTTP diretas no diagnóstico | https://nodejs.org/api |

---

# Fase 3 — Orçamentos, metas e plano de poupança

## 9. Gates de código (Fase 3)

| Comando | Resultado |
|---|---|
| `npm run lint` (eslint) | ✅ 0 erros, 0 avisos |
| `npx tsc --noEmit` | ✅ 0 erros (TS estrito) |
| `npm test` (vitest 5.0.3) | ✅ 5 arquivos, **55/55 testes** (acrescenta: `savings`, `projection`, `budget`) |
| `npm run build` | ✅ compila; `/orcamentos` e `/metas` agora são rotas dinâmicas com as telas reais |

## 10. Verificação automatizada contra o banco real

`npm run verify:fase3` → **21 verificações: 21 PASS, 0 FAIL**

| # | Verificação | Esperado | Obtido |
|---|---|---|---|
| 1 | Login seed-a / seed-b | sessão | ✅ sessão/sessão |
| 2 | Criar meta de teste | id | ✅ id |
| 3 | **Cr. 1:** meta R$ 6.000 / 12 meses | `months_left` 12, aporte R$ 500,00 | ✅ 12 / R$ 500,00 |
| 4 | **Cr. 2:** aporte parcial | saved 300000, 50%, active | ✅ igual |
| 5 | **Cr. 2:** atingir o alvo | saved 600000, 100%, done | ✅ igual |
| 6 | **Cr. 2:** remover aporte | saved 300000, active | ✅ igual |
| 7 | **Cr. 3:** 80% do limite | 80 → tom `atencao` | ✅ 80 → amarelo |
| 8 | **Cr. 3:** 100% do limite | 100, restante 0 → `estouro` | ✅ 100 / 0 → vermelho |
| 9 | **Cr. 4:** copiar só o inexistente | `copy_budget` = 1 | ✅ 1 |
| 10 | **Cr. 4:** não sobrescreve | c1 111111, c2 333333 | ✅ 111111 / 333333 |
| 11 | **Cr. 5:** projeção do mês | `projetado >= gasto`, risco `true` | ✅ 172360, risco `true` |
| 12 | **Cr. 5:** mês passado não projeta | `null` | ✅ `null` |
| 13 | **Cr. 6:** meta de A invisível para B | 0 | ✅ 0 |
| 14 | **Cr. 6:** update meta de A por B | 0 linhas | ✅ 0 |
| 15 | **Cr. 6:** delete meta de A por B | 0 linhas | ✅ 0 |
| 16 | **Cr. 6:** aporte de B na meta de A | erro de policy | ✅ erro de policy |
| 17 | **Cr. 6:** `saved_cents` de A não contamina | 300000 | ✅ 300000 |
| 18 | **Cr. 6:** B vê 0 limites em `budgets` | 0 | ✅ 0 |
| 19 | **Cr. 6:** `budget_status` de B só limites próprios | 0 | ✅ 0 |
| 20 | **Cr. 6:** `copy_budget` de B não copia A | 0 | ✅ 0 |

## 11. Achados da Fase 3 (corrigidos na migration)

1. **Soma sem filtro de usuário na trigger** — `refresh_goal_progress` somava
   `goal_contributions where goal_id = X` sem `user_id`. Como a FK `goal_id`
   não valida RLS, um aporte de outro usuário apontando para a meta alheia
   contaminaria `saved_cents` da vítima no próximo recálculo.
   → Corrigido: `and c.user_id = (select auth.uid())`.
2. **Políticas de `goal_contributions` não verificavam o dono da meta** —
   `insert`/`with check` só exigiam `user_id = auth.uid()`, permitindo a linha
   órfã do item 1.
   → Corrigido: `exists (select 1 from goals g where g.id = goal_id and g.user_id = auth.uid())`
   no `with check` de insert e update.
3. **Banco ficou com a versão anterior da migration** — as duas correções acima
   entraram no arquivo `20261005000000_fase3_orcamentos_metas.sql` depois da
   primeira aplicação, e reaplicar o arquivo completo não surtiu efeito (SQL
   Editor: transação falhou e desfez, ou cópia antiga).
   → Corrigido com `supabase/fix_fase3_policies.sql` (mesmo trecho, arquivo
   curto, idempotente, termina com a conferência das políticas). Verificação 16
   passou na sequência → `verify:fase3` 21/21.

## 12. Como reproduzir (Fase 3)

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
npm run verify:fase3   # 21 verificações contra o banco real
```

No SQL Editor: `supabase/migrations/20261005000000_fase3_orcamentos_metas.sql`
(idempotente) — e, se a versão anterior já tiver sido aplicada,
`supabase/fix_fase3_policies.sql` para as correções de RLS/trigger.

Validação manual (conta `seed-a`):
1. `/metas` → Nova meta: "Reserva", alvo **6.000,00**, prazo **+12 meses** →
   no card: aporte **R$ 500,00/mês** e prazo em meses.
2. Detalhes → registrar aportes → barra de progresso sobe; ao chegar em 6.000
   a meta vira **Concluída** sozinha; excluir o aporte reabre.
3. `/orcamentos` → digitar limite de uma categoria com gasto ≈ 100% → barra
   vermelha + badge "Estourou o limite"; ≈ 80% → amarela + "Atenção: ≥80%".
4. `/painel` → card "Orçamento: X categoria(s) em alerta" com link para `/orcamentos`.
5. `/orcamentos` → "Copiar orçamento do mês anterior" → limites novos entram,
   os já existentes não mudam.
6. **RLS:** logar com `seed-b@orgfinance.dev` → `/metas` e `/orcamentos` vazios
   (nada de A); editar a URL não altera dado alheio.

## 13. Bibliotecas citadas (Fase 3)

| Biblioteca | Versão | Uso | Doc |
|---|---|---|---|
| date-fns | ^4.4.0 | `differenceInCalendarMonths`, `addMonths`, `getDaysInMonth`, `format`/`parseISO` em `finance/savings.ts`, `finance/projection.ts`, `finance/dates.ts` | https://date-fns.org |
| react-hook-form + @hookform/resolvers | ^7.89.0 / ^5.9.1 | formulários de meta e de aporte com máscara BRL | https://react-hook-form.com |
| zod | ^4.6.5 | schemas de entrada (`schemas/goal.ts`, `schemas/budget.ts`) | https://zod.dev |
| @tanstack/react-query | ^5.104.1 | cache/invalidação das telas de orçamento e metas | https://tanstack.com/query |
| @supabase/supabase-js | ^2.117.2 | login + PostgREST + `rpc()` no `verify-fase3.mjs` | https://supabase.com/docs/reference/javascript |
| sonner | ^2.0.8 | toasts de sucesso/erro | https://sonner.emilkowal.dev |
| lucide-react | ^1.52.0 | ícones da interface | https://lucide.dev |
| shadcn/ui + radix-ui | ^4.21.1 / ^1.6.7 | `Dialog`, `AlertDialog`, `Progress`, `Table`, `Badge`, `Input` (componente `Alert` criado localmente) | https://ui.shadcn.com |
| recharts | ^3.8.0 | barras "limite vs. gasto" em `/orcamentos` | https://recharts.org |
| vitest | 5.0.3 | 55 testes unitários (savings, projection, budget + herdados) | https://vitest.dev |
