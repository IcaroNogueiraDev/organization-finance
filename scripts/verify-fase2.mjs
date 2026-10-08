// Verificação da Fase 2 contra o Supabase real (rede + credenciais de teste).
// Uso: node scripts/verify-fase2.mjs   (ou npm run verify:fase2)
// Requer: migration da Fase 2 + seed_fase2.sql aplicados no SQL Editor.
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

const a = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const b = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: sa, error: ea } = await a.auth.signInWithPassword(USER_A);
const { data: sb, error: eb } = await b.auth.signInWithPassword(USER_B);
check("login seed-a", "sessão", ea ? `erro: ${ea.message}` : "sessão OK", !ea && !!sa.session);
check("login seed-b", "sessão", eb ? `erro: ${eb.message}` : "sessão OK", !eb && !!sb.session);
if (ea || eb) process.exit(1);

// --- volume e meses ---------------------------------------------------------
const { data: rowsA, error: eListA, count: countA } = await a
  .from("transactions")
  .select("*", { count: "exact" })
  .order("occurred_on", { ascending: true });
if (eListA) console.error(eListA);

check("A: total de transações", 20, countA, countA === 20);

const byMonth = {};
for (const r of rowsA ?? []) {
  const m = r.occurred_on.slice(0, 7);
  byMonth[m] = (byMonth[m] ?? 0) + 1;
}
check("A: linhas por mês", { "2026-08": 7, "2026-09": 7, "2026-10": 6 }, byMonth,
  byMonth["2026-08"] === 7 && byMonth["2026-09"] === 7 && byMonth["2026-10"] === 6);

// --- critério 1: cartões (monthly_summary) ----------------------------------
const esperadoMes = {
  "2026-08-01": { total_income_cents: 430000, total_expense_cents: 193400, balance_cents: 236600 },
  "2026-09-01": { total_income_cents: 350000, total_expense_cents: 209590, balance_cents: 140410 },
  "2026-10-01": { total_income_cents: 395000, total_expense_cents: 176000, balance_cents: 219000 },
};
for (const [mes, esperado] of Object.entries(esperadoMes)) {
  const { data, error } = await a.rpc("monthly_summary", { p_month: mes });
  const obtido = data?.[0] ?? null;
  const ok = !error && obtido
    && obtido.total_income_cents === esperado.total_income_cents
    && obtido.total_expense_cents === esperado.total_expense_cents
    && obtido.balance_cents === esperado.balance_cents;
  check(`monthly_summary(${mes})`, esperado, error ? `erro: ${error.message}` : obtido, !!ok);
}

// soma manual das 20 linhas vs soma geral
const somaManual = (rowsA ?? []).reduce(
  (acc, r) => {
    if (r.type === "income") acc.total_income_cents += r.amount_cents;
    else acc.total_expense_cents += r.amount_cents;
    return acc;
  },
  { total_income_cents: 0, total_expense_cents: 0 },
);
somaManual.balance_cents = somaManual.total_income_cents - somaManual.total_expense_cents;
{
  const { data, error } = await a.rpc("monthly_summary", { p_month: "2026-08-01" });
  // confere os 3 meses somando as linhas brutas
  let soma3meses = { total_income_cents: 0, total_expense_cents: 0, balance_cents: 0 };
  for (const mes of ["2026-08-01", "2026-09-01", "2026-10-01"]) {
    const { data: d } = await a.rpc("monthly_summary", { p_month: mes });
    if (d?.[0]) {
      soma3meses.total_income_cents += d[0].total_income_cents;
      soma3meses.total_expense_cents += d[0].total_expense_cents;
      soma3meses.balance_cents += d[0].balance_cents;
    }
  }
  check("cartões = soma manual das 20 linhas", somaManual, soma3meses,
    JSON.stringify(somaManual) === JSON.stringify(soma3meses));
  void data; void error;
}

// --- critério 2: meses sem transação = zero (monthly_series) -----------------
const { data: serie, error: eSerie } = await a.rpc("monthly_series", { p_months: 6 });
{
  const linhas = serie ?? [];
  const meses = linhas.map((l) => l.month.slice(0, 7));
  check("monthly_series(6): 6 meses (2026-05..2026-10)",
    ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    meses,
    !eSerie && JSON.stringify(meses) === JSON.stringify(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]));

  const vazios = linhas
    .filter((l) => ["2026-05", "2026-06", "2026-07"].includes(l.month.slice(0, 7)))
    .map((l) => ({ mes: l.month.slice(0, 7), income: l.income_cents, expense: l.expense_cents, balance: l.balance_cents }));
  check("meses vazios com zero",
    [{ mes: "2026-05", income: 0, expense: 0, balance: 0 },
     { mes: "2026-06", income: 0, expense: 0, balance: 0 },
     { mes: "2026-07", income: 0, expense: 0, balance: 0 }],
    vazios,
    vazios.length === 3 && vazios.every((v) => v.income === 0 && v.expense === 0 && v.balance === 0));

  const agora = linhas.find((l) => l.month.slice(0, 7) === "2026-10");
  check("monthly_series(2026-10) = resumo do mês", esperadoMes["2026-10-01"],
    agora ? { total_income_cents: agora.income_cents, total_expense_cents: agora.expense_cents, balance_cents: agora.balance_cents } : null,
    !!agora && agora.income_cents === 395000 && agora.expense_cents === 176000 && agora.balance_cents === 219000);
}

// --- critério 1/2: despesas por categoria ------------------------------------
{
  const { data, error } = await a.rpc("expenses_by_category", { p_month: "2026-10-01" });
  const total = (data ?? []).reduce((s, r) => s + r.total_cents, 0);
  const top = data?.[0];
  const pct = (data ?? []).reduce((s, r) => s + Number(r.percent), 0);
  check("expenses_by_category(2026-10): total e nº de categorias",
    { linhas: 4, total_cents: 176000 },
    { linhas: data?.length ?? 0, total_cents: total },
    !error && data?.length === 4 && total === 176000);
  check("expenses_by_category(2026-10): topo = Moradia 120000",
    { nome: "Moradia", total: 120000, percent: 68.2 },
    top ? { nome: top.category_name, total: top.total_cents, percent: Number(top.percent) } : null,
    !!top && top.category_name === "Moradia" && top.total_cents === 120000 && Number(top.percent) === 68.2);
  check("percentuais somam ~100", "~100", pct.toFixed(1), Math.abs(pct - 100) <= 0.1);
}
{
  const { data, error } = await a.rpc("expenses_by_category", { p_month: "2026-08-01" });
  const semCat = (data ?? []).find((r) => r.category_name === "Sem categoria");
  check("expenses_by_category(2026-08): transação sem categoria aparece",
    { nome: "Sem categoria", total_cents: 12000 },
    semCat ? { nome: semCat.category_name, total_cents: semCat.total_cents } : null,
    !error && !!semCat && semCat.total_cents === 12000);
}

// --- critério 4: filtros + paginação ----------------------------------------
{
  const { count: c } = await a.from("transactions").select("*", { count: "exact", head: true }).eq("type", "expense");
  check("filtro type=expense", 15, c, c === 15);
}
{
  const { data } = await a.from("transactions")
    .select("id, categories!inner(name)")
    .eq("categories.name", "Moradia");
  check("filtro categoria Moradia", 3, data?.length ?? 0, data?.length === 3);
}
{
  const { data } = await a.from("transactions")
    .select("*")
    .ilike("description", "%Supermercado%");
  check("busca 'Supermercado'", 1, data?.length ?? 0, data?.length === 1);
}
{
  const { count: c } = await a.from("transactions")
    .select("*", { count: "exact", head: true })
    .gte("occurred_on", "2026-09-01").lt("occurred_on", "2026-10-01")
    .eq("type", "expense");
  check("filtro combinado: 2026-09 + despesas", 6, c, c === 6);
}
{
  const { data: p1, count: c1 } = await a.from("transactions")
    .select("*", { count: "exact" })
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false })
    .range(0, 19);
  const { data: p2 } = await a.from("transactions")
    .select("*")
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false })
    .range(20, 39);
  check("paginação: página 1 (20 por página)", { linhas: 20, count: 20 },
    { linhas: p1?.length ?? 0, count: c1 },
    (p1?.length ?? 0) === 20 && c1 === 20);
  check("paginação: página 2 vazia", 0, p2?.length ?? 0, (p2?.length ?? 0) === 0);
}

// --- critério 3: isolamento entre usuários (RLS) ----------------------------
{
  const { data: rowsB, count: countB } = await b
    .from("transactions")
    .select("*", { count: "exact" });
  check("B: vê apenas as próprias transações", 3, countB, countB === 3);

  const idsA = new Set((rowsA ?? []).map((r) => r.id));
  const vazamento = (rowsB ?? []).filter((r) => idsA.has(r.id));
  check("B: nenhuma linha de A visível", 0, vazamento.length, vazamento.length === 0);

  const alvo = rowsA?.find((r) => r.description === "Salário agosto");
  if (!alvo) {
    check("RLS: linha-alvo de A existe", "1", 0, false);
  } else {
    const { data: direto } = await b.from("transactions").select("id").eq("id", alvo.id);
    check("B: leitura direta por id de A", 0, direto?.length ?? 0, (direto?.length ?? 0) === 0);

    const { data: upd } = await b.from("transactions")
      .update({ description: alvo.description })
      .eq("id", alvo.id)
      .select("id");
    check("B: update em linha de A bloqueado (RLS)", 0, upd?.length ?? 0, (upd?.length ?? 0) === 0);

    const { data: minhaA } = await a.from("transactions").select("id").eq("id", alvo.id);
    check("A: continua vendo a própria linha", 1, minhaA?.length ?? 0, (minhaA?.length ?? 0) === 1);
  }

  const { count: catA } = await a.from("categories").select("*", { count: "exact", head: true });
  const { count: catB } = await b.from("categories").select("*", { count: "exact", head: true });
  check("categorias: 12 para cada usuário", { a: 12, b: 12 }, { a: catA, b: catB }, catA === 12 && catB === 12);
}

// --- resumo -----------------------------------------------------------------
const falhas = results.filter((r) => !r.ok);
console.log("\n==============================================");
console.log(`Verificações: ${results.length} | PASS: ${results.length - falhas.length} | FAIL: ${falhas.length}`);
if (falhas.length > 0) {
  console.log("Falhas:");
  for (const f of falhas) console.log(`  - ${f.name}`);
}
process.exit(falhas.length > 0 ? 1 : 0);
