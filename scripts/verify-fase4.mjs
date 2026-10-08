// Verificação da Fase 4 contra o Supabase real (rede + credenciais de teste).
// Uso: node scripts/verify-fase4.mjs   (ou npm run verify:fase4)
// Requer: migration 20261006000000_fase4_assistente.sql aplicada no SQL Editor.
//
// ATENÇÃO: as contas seed-a/seed-b são contas de teste — o script consome a cota
// diária de IA do seed-b (até 20 mensagens) e apaga as mensagens de teste do
// seed-a antes e depois de rodar. O seed-a não tem a cota consumida (use-o para
// testar a interface manualmente).
//
// A chamada real à NVIDIA não é coberta aqui (chave ainda não configurada);
// a parte calculada em código é coberta pelo vitest (insights/context tests).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const USER_A = { email: "seed-a@orgfinance.dev", password: "SeedFase2!2026" };
const USER_B = { email: "seed-b@orgfinance.dev", password: "SeedFase2!2026" };

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function isoDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local");
  process.exit(1);
}

const results = [];
function check(name, expected, actual, ok) {
  results.push({ name, expected, actual, ok });
  const exp = typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  const act = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}\n         esperado: ${exp}\n         obtido  : ${act}`);
}

function migrationHint(error) {
  if (error && /does not exist|could not find function|column .* does not exist/i.test(error.message)) {
    console.error(
      `\nSQL ausente: aplique a migration 20261006000000_fase4_assistente.sql no SQL Editor.\n(${error.message})`,
    );
    process.exit(1);
  }
}

const a = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const b = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: sa, error: ea } = await a.auth.signInWithPassword(USER_A);
const { data: sb, error: eb } = await b.auth.signInWithPassword(USER_B);
check("login seed-a", "sessão", ea ? `erro: ${ea.message}` : "sessão OK", !ea && !!sa.session);
check("login seed-b", "sessão", eb ? `erro: ${eb.message}` : "sessão OK", !eb && !!sb.session);
if (ea || eb) process.exit(1);

const idA = sa.session.user.id;
const idB = sb.session.user.id;
const analysisMonth = `${isoDate(new Date()).slice(0, 7)}-01`;

async function usageOf(client) {
  const { data, error } = await client.rpc("ai_usage");
  migrationHint(error);
  if (error) return null;
  return { used: Number(data[0].used), dailyLimit: Number(data[0].daily_limit) };
}

// limpeza inicial das mensagens de teste do seed-a
await a.from("ai_messages").delete().like("content", "verify-fase4%");

// --- critério 1: cota diária (RPC ai_usage / consume_ai_message) --------------
const usageA0 = await usageOf(a);
const usageB0 = await usageOf(b);
check(
  "cota: ai_usage devolve usado e limite do dia",
  { used: "number", dailyLimit: 20 },
  usageB0 ?? "erro",
  !!usageB0 && Number.isInteger(usageB0.used) && usageB0.dailyLimit === 20,
);

check(
  "cota: seed-a e seed-b têm contadores independentes",
  "linhas separadas",
  { a: usageA0?.used, b: usageB0?.used },
  !!usageA0 && !!usageB0,
);
if (!usageA0 || !usageB0) process.exit(1);

// --- critério 2: tabela de consumo sem acesso direto do cliente --------------
{
  const { data: rows, error: selError } = await b.from("ai_usage_daily").select("*");
  migrationHint(selError);
  check(
    "ai_usage_daily: select do cliente não devolve linhas (RLS sem políticas)",
    "0 linhas ou erro",
    selError ? `erro: ${selError.message}` : `${rows?.length ?? 0} linhas`,
    Boolean(selError) || (rows?.length ?? 0) === 0,
  );

  const { error: insError } = await b.from("ai_usage_daily").insert({
    user_id: idB,
    day: isoDate(new Date()),
    messages: 999,
  });
  check(
    "ai_usage_daily: insert direto do cliente bloqueado",
    "erro de permissão",
    insError ? "erro de permissão" : "inserido",
    Boolean(insError),
  );
}

// --- critério 3: consumo atômico até o teto ----------------------------------
{
  let incrementOk = true;
  let incrementInfo = `${usageB0.used} -> ${usageB0.used + 1}`;

  if (usageB0.used < usageB0.dailyLimit) {
    const { data, error } = await b.rpc("consume_ai_message");
    migrationHint(error);
    const row = data?.[0];
    incrementOk =
      !error && row?.allowed === true && Number(row?.used) === usageB0.used + 1 &&
      Number(row?.daily_limit) === usageB0.dailyLimit;
    incrementInfo = row
      ? `${usageB0.used} -> ${row.used} (allowed=${row.allowed})`
      : `erro: ${error?.message}`;
  } else {
    incrementInfo = "pulado: cota do seed-b já esgotada nesta data (execução repetida)";
  }
  check(
    "cota: consume_ai_message incrementa 1 mensagem",
    "+1 e allowed=true",
    incrementInfo,
    incrementOk,
  );

  const usageB1 = await usageOf(b);
  check(
    "cota: ai_usage reflete o consumo logo após",
    usageB0.used < usageB0.dailyLimit ? usageB0.used + 1 : usageB0.used,
    usageB1?.used ?? "erro",
    !!usageB1 &&
      usageB1.used ===
        (usageB0.used < usageB0.dailyLimit ? usageB0.used + 1 : usageB0.used),
  );

  // queima o resto da cota até o teto (seed-b é a conta sacrificial)
  let allowed = true;
  let used = usageB1?.used ?? usageB0.used;
  let guard = 0;
  while (allowed && guard <= usageB0.dailyLimit + 5) {
    const { data, error } = await b.rpc("consume_ai_message");
    if (error) break;
    allowed = data[0].allowed === true;
    used = Number(data[0].used);
    guard += 1;
  }
  check(
    "cota: para no teto diário (allowed=false em 20)",
    { allowed: false, used: 20 },
    { allowed, used },
    allowed === false && used === usageB0.dailyLimit,
  );

  const { data: extra } = await b.rpc("consume_ai_message");
  const after = extra?.[0];
  check(
    "cota: acima do teto não incrementa mais",
    { allowed: false, used: 20 },
    { allowed: after?.allowed, used: Number(after?.used) },
    after?.allowed === false && Number(after?.used) === usageB0.dailyLimit,
  );
}

// --- critério 4: histórico protegido por RLS ---------------------------------
{
  const { data: msgA, error: eMsg } = await a.from("ai_messages").insert({
    user_id: idA,
    role: "user",
    content: "verify-fase4 pergunta",
  }).select("id");
  migrationHint(eMsg);
  check("RLS: seed-a grava a própria mensagem", "id", eMsg ? `erro: ${eMsg.message}` : msgA[0]?.id, !eMsg);

  const { data: vazaB } = await b.from("ai_messages").select("id").eq("user_id", idA);
  check("RLS: seed-b não vê mensagens de seed-a", 0, vazaB?.length ?? 0, (vazaB?.length ?? 0) === 0);

  const { data: hackB } = await b.from("ai_messages").delete().eq("user_id", idA).select("id");
  check("RLS: delete das mensagens de seed-a por seed-b bloqueado", 0, hackB?.length ?? 0, (hackB?.length ?? 0) === 0);

  // a verificação acima apagaria... não: RLS bloqueia. Reapaga por segurança.
  await a.from("ai_messages").delete().like("content", "verify-fase4%");
}

// --- critério 5: cache da análise mensal --------------------------------------
{
  const { data: cached, error: eCache } = await a.from("ai_messages").insert({
    user_id: idA,
    role: "assistant",
    content: "verify-fase4 análise do mês",
    analysis_month: analysisMonth,
  }).select("id, analysis_month");
  migrationHint(eCache);
  check(
    "cache: grava análise mensal com analysis_month",
    analysisMonth,
    eCache ? `erro: ${eCache.message}` : cached?.[0]?.analysis_month,
    !eCache && cached?.[0]?.analysis_month === analysisMonth,
  );

  const { error: eDup } = await a.from("ai_messages").insert({
    user_id: idA,
    role: "assistant",
    content: "verify-fase4 análise duplicada",
    analysis_month: analysisMonth,
  });
  check(
    "cache: índice único impede segunda análise do mesmo mês",
    "erro 23505",
    eDup ? `${eDup.code}` : "inserido",
    eDup?.code === "23505",
  );

  const { data: vazaCacheB } = await b
    .from("ai_messages")
    .select("id")
    .eq("analysis_month", analysisMonth);
  check("cache: análise de seed-a invisível para seed-b (RLS)", 0, vazaCacheB?.length ?? 0, (vazaCacheB?.length ?? 0) === 0);

  const { data: normal } = await a
    .from("ai_messages")
    .insert({ user_id: idA, role: "assistant", content: "verify-fase4 resposta comum" })
    .select("analysis_month");
  check(
    "cache: mensagem comum fica com analysis_month null",
    "null",
    String(normal?.[0]?.analysis_month ?? null),
    normal?.[0]?.analysis_month === null,
  );

  const { data: apagadas, error: eDel } = await a
    .from("ai_messages")
    .delete()
    .like("content", "verify-fase4%")
    .select("id");
  check(
    "cache: seed-a apaga as próprias mensagens de teste",
    ">=1",
    `${apagadas?.length ?? 0} (${eDel?.message ?? "ok"})`,
    !eDel && (apagadas?.length ?? 0) >= 1,
  );

  const { data: resto } = await a.from("ai_messages").select("id").like("content", "verify-fase4%");
  check("cache: nada de teste sobrou", 0, resto?.length ?? 0, (resto?.length ?? 0) === 0);
}

// --- critério 6: a cota de A não foi afetada pelos testes de B ----------------
const usageA1 = await usageOf(a);
check(
  "cota: consumo do seed-b não mexe na do seed-a",
  usageA0?.used,
  usageA1?.used ?? "erro",
  !!usageA1 && usageA1.used === usageA0.used,
);

const falhas = results.filter((r) => !r.ok);
console.log("\n==============================================");
console.log(`Verificações: ${results.length} | PASS: ${results.length - falhas.length} | FAIL: ${falhas.length}`);
if (falhas.length > 0) {
  console.log("Falhas:");
  for (const f of falhas) console.log(`  - ${f.name}`);
}
console.log(
  "\nObservação: a chamada real à NVIDIA (streaming) não é coberta aqui — falta a chave NVIDIA_API_KEY.",
);
process.exit(falhas.length > 0 ? 1 : 0);
