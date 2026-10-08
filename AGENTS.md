<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regras do projeto (org-finance)

Plano de desenvolvimento completo em `PLANO.md`. Seguir as fases na ordem, uma fase por vez.

1. Sempre **preferir bibliotecas e APIs prontas** a código próprio.
2. Ao usar qualquer biblioteca/API/serviço, **citar no final da tarefa**: nome, versão, para que foi usada e link da documentação.
3. **Não mudar o plano** sem avisar: listar a mudança, o motivo e esperar aprovação.
4. TypeScript estrito, sem `any`. Validação com **Zod** nas entradas.
5. Uma fase por vez; ao terminar, rodar `lint`, `tsc` e testar o critério de aceite da fase.
6. Nunca expor `SUPABASE_SERVICE_ROLE_KEY` nem a chave da IA no client. Chave da NVIDIA só em Route Handler/Server Action.
7. Textos da interface em **pt-BR**, moeda **BRL** (`Intl.NumberFormat`), valores monetários em **centavos** (inteiro).

## Convenções

- Rotas autenticadas protegidas em `src/proxy.ts` (Next.js 16: `middleware.ts` está deprecado).
- Clientes Supabase sempre em `src/lib/supabase/` (client, server, proxy) — nunca instanciar fora desses arquivos.
- Views SQL usam `security_invoker = true` para herdar o RLS do usuário.
- Nomes de rotas: `/painel`, `/transacoes`, `/orcamentos`, `/metas`, `/assistente`, `/login`, `/cadastro`.
