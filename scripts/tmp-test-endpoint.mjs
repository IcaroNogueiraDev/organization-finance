// Teste do endpoint /api/assistant com sessão real + medição de latência.
// Uso: node test-endpoint.mjs <caminho/.env.local>
// Não imprime chaves; mostra status, TTFB, TTFT (1º token) e total.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = process.argv[2];
const BASE_URL = process.argv[3] || "http://localhost:3000";

const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supa.auth.signInWithPassword({
  email: "seed-a@orgfinance.dev",
  password: "SeedFase2!2026",
});
if (error) {
  console.error("login falhou:", error.message);
  process.exit(1);
}
const cookieValue = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");

async function call(label, payload) {
  const started = performance.now();
  let headersAt = null;
  let firstTextAt = null;
  let status = 0;
  let text = "";
  let cache = "";
  try {
    const res = await fetch(`${BASE_URL}/api/assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookieName}=${cookieValue}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),
    });
    status = res.status;
    headersAt = performance.now() - started;
    cache = res.headers.get("x-assistant-cache") || "";

    if (!res.ok) {
      const body = await res.text();
      console.log(`\n[${label}] HTTP ${status} em ${Math.round(headersAt)} ms`);
      console.log(`  corpo: ${body.slice(0, 300)}`);
      return { label, status, error: body.slice(0, 200) };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      if (piece) {
        if (firstTextAt === null) firstTextAt = performance.now() - started;
        text += piece;
      }
    }
    const total = performance.now() - started;
    console.log(
      `\n[${label}] HTTP ${status} | headers ${Math.round(headersAt)} ms | 1º token ${Math.round(firstTextAt ?? total)} ms | total ${Math.round(total)} ms${cache ? ` | cache=${cache}` : ""}`,
    );
    console.log(`  resposta (${text.length} chars): ${text.replace(/\n+/g, " ⏎ ").slice(0, 400)}`);
    return { label, status, headersAt, firstTextAt, total, text, cache };
  } catch (err) {
    console.log(`\n[${label}] ERRO após ${Math.round(performance.now() - started)} ms: ${String(err).slice(0, 200)}`);
    return { label, error: String(err) };
  }
}

const results = [];
results.push(
  await call("1. aceite (categoria que cresceu)", {
    message:
      "Qual categoria de despesa mais cresceu de setembro para outubro de 2026? Responda com o nome da categoria e o valor em R$.",
    analysis: false,
  }),
);
results.push(await call("2. chat rápido", { message: "Olá! Em 1 frase, o que você faz?", analysis: false }));
results.push(await call("3. análise do mês (cache)", { message: "Analise o meu mês.", analysis: true }));
results.push(await call("4. análise do mês de novo (cache)", { message: "Analise o meu mês de novo.", analysis: true }));

console.log("\n=== resumo ===");
for (const r of results) {
  if (r.error) console.log(`  - ${r.label}: ERRO`);
  else
    console.log(
      `  - ${r.label}: headers ${Math.round(r.headersAt)} ms | 1º token ${Math.round(r.firstTextAt ?? r.total)} ms | total ${Math.round(r.total)} ms${r.cache ? " | cache hit" : ""}`,
    );
}
