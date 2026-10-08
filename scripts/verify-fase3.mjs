// Verificação da Fase 3 contra o Supabase real (rede + credenciais de teste).
// Uso: node scripts/verify-fase3.mjs   (ou npm run verify:fase3)
// Requer: migration 20261005000000_fase3_orcamentos_metas.sql aplicada no SQL Editor.
//
// ATENÇÃO: as contas seed-a/seed-b são contas de teste — o script apaga todos os
// budgets delas e as metas chamadas "Meta teste fase3" antes e depois de rodar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const USER_A = { email: "seed-a@orgfinance.dev", password: "SeedFase2!2026" };
const USER_B = { email: "seed-b@orgfinance.dev", password: "SeedFase2!2026" };
const GOAL_NAME = "Meta teste fase3";
const TARGET_CENTS = 600000; // R$ 6.000,00

const TODAY = new Date();
const MONTH_SRC = "2026-06-01"; // copy_budget: origem (sem dados de teste)
const MONTH_DEST = "2026-07-01"; // copy_budget: destino
const MONTH_BUDGET = "2026-09-01"; // cores 80%/100% (mês com despesas no seed)
const MONTH_CURRENT = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-01`;

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

function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Espelho de budgetTone (src/lib/finance/budget.ts) — a real é coberta pelo vitest. */
function tone(percent) {
  if (percent === null || Number.isNaN(percent)) return null;
  if (percent >= 100) return "estouro";
  if (percent >= 80) return "atencao";
  return "ok";
}

/** Espelho de projectedMonthEnd (src/lib/finance/projection.ts) — coberto pelo vitest. */
function projectedMonthEndMirror(monthKey, spent, today) {
  const [y, m] = monthKey.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (monthStart.getTime() !== currentMonth.getTime()) return null;
  const elapsed = today.getDate();
  if (elapsed <= 0) return null;
  return Math.round((spent / elapsed) * daysInMonth(monthKey));
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
  if (error && /does not exist|could not find function/i.test(error.message)) {
    console.error(
      `\nFunção SQL ausente: aplique a migration 20261005000000_fase3_orcamentos_metas.sql no SQL Editor.\n(${error.message})`,
    );
    process.exit(1);
  }
}

function percentOf(row) {
  return row && row.percent_used !== null && row.percent_used !== undefined
    ? Number(row.percent_used)
    : null;
}

async function clearBudgets(client) {
  const { error } = await client.from("budgets").delete().gte("month", "1900-01-01");
  if (error) console.error("cleanup budgets:", error.message);
}

async function clearTestGoals(client) {
  const { data } = await client.from("goals").select("id").eq("name", GOAL_NAME);
  for (const goal of data ?? []) {
    const { error } = await client.from("goals").delete().eq("id", goal.id);
    if (error) console.error("cleanup goals:", error.message);
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

// limpeza inicial (determinismo das contagens)
await clearBudgets(a);
await clearBudgets(b);
await clearTestGoals(a);
await clearTestGoals(b);

// --- critério 1: meta de R$ 6.000 em 12 meses = R$ 500/mês ------------------
const deadline = isoDate(new Date(TODAY.getFullYear() + 1, TODAY.getMonth(), 1)); // 12 meses exatos
{
  const { data: goal, error } = await a
    .from("goals")
    .insert({
      user_id: idA,
      name: GOAL_NAME,
      target_cents: TARGET_CENTS,
      deadline,
      status: "active",
    })
    .select("id")
    .single();
  check("criar meta de teste", "id", error ? `erro: ${error.message}` : goal.id, !error && !!goal);
  if (error) process.exit(1);

  const { data: rows, error: eProg } = await a.rpc("goal_progress");
  migrationHint(eProg);
  const row = (rows ?? []).find((r) => r.id === goal.id);
  const monthsLeft = row ? Number(row.months_left) : null;
  const required = monthsLeft ? Math.ceil(Math.max(TARGET_CENTS - Number(row.saved_cents), 0) / monthsLeft) : null;
  const brl = required === null ? "-" : `R$ ${(required / 100).toFixed(2).replace(".", ",")}`;
  check(
    "critério 1: aporte de R$ 6.000 em 12 meses",
    { months_left: 12, aporte: "R$ 500,00" },
    { months_left: monthsLeft, aporte: brl },
    monthsLeft === 12 && required === 50000,
  );
}

// --- critério 2: aportes atualizam progresso e concluem a meta ---------------
const goalId = (await a.from("goals").select("id").eq("name", GOAL_NAME).single()).data.id;
{
  const contribuir = (amount) =>
    a.from("goal_contributions").insert({
      user_id: idA,
      goal_id: goalId,
      amount_cents: amount,
      contributed_on: isoDate(TODAY),
    });

  await contribuir(300000);
  let { data: rows } = await a.rpc("goal_progress");
  let row = (rows ?? []).find((r) => r.id === goalId);
  check(
    "critério 2: aporte parcial atualiza progresso",
    { saved_cents: 300000, percent: 50, status: "active" },
    row
      ? { saved_cents: Number(row.saved_cents), percent: Number(row.percent), status: row.status }
      : null,
    !!row && Number(row.saved_cents) === 300000 && Number(row.percent) === 50 && row.status === "active",
  );

  await contribuir(300000);
  ({ data: rows } = await a.rpc("goal_progress"));
  row = (rows ?? []).find((r) => r.id === goalId);
  check(
    "critério 2: atingir o alvo conclui a meta",
    { saved_cents: 600000, percent: 100, status: "done" },
    row
      ? { saved_cents: Number(row.saved_cents), percent: Number(row.percent), status: row.status }
      : null,
    !!row && Number(row.saved_cents) === 600000 && Number(row.percent) === 100 && row.status === "done",
  );

  const { data: contribs } = await a
    .from("goal_contributions")
    .select("id")
    .eq("goal_id", goalId);
  const primeiro = contribs?.[0];
  await a.from("goal_contributions").delete().eq("id", primeiro.id);
  ({ data: rows } = await a.rpc("goal_progress"));
  row = (rows ?? []).find((r) => r.id === goalId);
  check(
    "critério 2: remover aporte recalcula e reabre a meta",
    { saved_cents: 300000, status: "active" },
    row ? { saved_cents: Number(row.saved_cents), status: row.status } : null,
    !!row && Number(row.saved_cents) === 300000 && row.status === "active",
  );
}

// --- critério 3: 80% amarelo, 100% vermelho ---------------------------------
{
  const { data: rows, error: eStatus } = await a.rpc("budget_status", { p_month: MONTH_BUDGET });
  migrationHint(eStatus);
  const alvo = (rows ?? []).find((r) => Number(r.spent_cents) > 0);
  if (!alvo) {
    check("critério 3: categoria com despesa em 2026-09", ">=1 linha", "nenhuma despesa no mês", false);
  } else {
    await a.from("budgets").delete().eq("category_id", alvo.category_id).eq("month", MONTH_BUDGET);
    const spent = Number(alvo.spent_cents);

    const upsert = (limit) =>
      a.from("budgets").upsert(
        { user_id: idA, category_id: alvo.category_id, month: MONTH_BUDGET, limit_cents: limit },
        { onConflict: "user_id,category_id,month" },
      );

    // limite = 125% do gasto → 80% usado (amarelo)
    const limit80 = Math.floor((spent * 100) / 80);
    await upsert(limit80);
    const { data: mid } = await a.rpc("budget_status", { p_month: MONTH_BUDGET });
    const row80 = (mid ?? []).find((r) => r.category_id === alvo.category_id);
    const pct80 = percentOf(row80);
    check(
      "critério 3: 80% do limite → alerta (amarelo)",
      { min: 80, max: 99.9, tom: "atencao" },
      { percent_used: pct80, tom: tone(pct80) },
      pct80 !== null && pct80 >= 80 && pct80 < 100 && tone(pct80) === "atencao",
    );

    // limite = gasto → 100% usado (vermelho)
    await upsert(spent);
    const { data: fim } = await a.rpc("budget_status", { p_month: MONTH_BUDGET });
    const row100 = (fim ?? []).find((r) => r.category_id === alvo.category_id);
    const pct100 = percentOf(row100);
    check(
      "critério 3: 100% do limite → estouro (vermelho)",
      { percent_used: 100, remaining_cents: 0, tom: "estouro" },
      {
        percent_used: pct100,
        remaining_cents: row100 ? Number(row100.remaining_cents) : null,
        tom: tone(pct100),
      },
      pct100 === 100 && Number(row100?.remaining_cents) === 0 && tone(pct100) === "estouro",
    );

    await a.from("budgets").delete().eq("category_id", alvo.category_id).eq("month", MONTH_BUDGET);
  }
}

// --- critério 4: copiar orçamento não sobrescreve ----------------------------
{
  const { data: cats } = await a
    .from("categories")
    .select("id, name")
    .eq("type", "expense")
    .order("name");
  const c1 = cats?.[0];
  const c2 = cats?.find((c) => c.id !== c1?.id);
  if (!c1 || !c2) {
    check("critério 4: 2 categorias de despesa", "2", `${cats?.length ?? 0}`, false);
  } else {
    const put = (category_id, month, limit) =>
      a.from("budgets").upsert(
        { user_id: idA, category_id, month, limit_cents: limit },
        { onConflict: "user_id,category_id,month" },
      );
    await put(c1.id, MONTH_DEST, 111111); // já existe no destino
    await put(c1.id, MONTH_SRC, 222222);
    await put(c2.id, MONTH_SRC, 333333);

    const { data: copied, error: eCopy } = await a.rpc("copy_budget", {
      p_from: MONTH_SRC,
      p_to: MONTH_DEST,
    });
    migrationHint(eCopy);
    check("critério 4: copia só o limite inexistente", 1, Number(copied), Number(copied) === 1);

    const { data: rows } = await a.rpc("budget_status", { p_month: MONTH_DEST });
    const lim1 = (rows ?? []).find((r) => r.category_id === c1.id)?.limit_cents;
    const lim2 = (rows ?? []).find((r) => r.category_id === c2.id)?.limit_cents;
    check(
      "critério 4: limite existente não foi sobrescrito",
      { c1: 111111, c2: 333333 },
      { c1: Number(lim1), c2: Number(lim2) },
      Number(lim1) === 111111 && Number(lim2) === 333333,
    );
  }
}

// --- critério 5: projeção de fim de mês marca risco --------------------------
{
  const { data: rows, error: eStatus } = await a.rpc("budget_status", { p_month: MONTH_CURRENT });
  migrationHint(eStatus);
  const alvo = (rows ?? []).find((r) => Number(r.spent_cents) > 0);
  if (!alvo) {
    check("critério 5: despesa no mês atual para projetar", ">=1 linha", "nenhuma", false);
  } else {
    const spent = Number(alvo.spent_cents);
    const elapsed = TODAY.getDate();
    const total = daysInMonth(MONTH_CURRENT);
    const projetado = projectedMonthEndMirror(MONTH_CURRENT, spent, TODAY);
    // limite igual ao gasto atual (100% agora): risco = projeta acima do limite
    const risco = projetado !== null && projetado > spent;
    check(
      "critério 5: projeção até o fim do mês (espelho da fórmula)",
      { projetado: `>= ${spent}`, risco: elapsed < total },
      { projetado, risco },
      projetado !== null && projetado >= spent && risco === (elapsed < total),
    );
    const passado = `${TODAY.getFullYear()}-${String(TODAY.getMonth()).padStart(2, "0")}-01`;
    const projetadoPassado = projectedMonthEndMirror(passado, spent, TODAY);
    check(
      "critério 5: mês passado não projeta",
      "null",
      String(projetadoPassado),
      projetadoPassado === null,
    );
  }
}

// --- critério 6: isolamento entre usuários (RLS) -----------------------------
{
  const { data: rowsB, error: eProgB } = await b.rpc("goal_progress");
  migrationHint(eProgB);
  const vazou = (rowsB ?? []).find((r) => r.id === goalId);
  check("B: meta de A invisível em goal_progress", 0, vazou ? 1 : 0, !vazou);

  const { data: updB } = await b.from("goals").update({ name: "hack" }).eq("id", goalId).select("id");
  check("B: update na meta de A bloqueado (RLS)", 0, updB?.length ?? 0, (updB?.length ?? 0) === 0);

  const { data: delB } = await b.from("goals").delete().eq("id", goalId).select("id");
  check("B: delete da meta de A bloqueado (RLS)", 0, delB?.length ?? 0, (delB?.length ?? 0) === 0);

  const { error: eContrib } = await b.from("goal_contributions").insert({
    user_id: idB,
    goal_id: goalId,
    amount_cents: 10000,
    contributed_on: isoDate(TODAY),
  });
  check(
    "B: aporte apontando para meta de A bloqueado",
    "erro de policy",
    eContrib ? "erro de policy" : "inserido",
    !!eContrib,
  );

  const { data: apos, error: eProgA } = await a.rpc("goal_progress");
  migrationHint(eProgA);
  const { data: goalA } = await a.from("goals").select("saved_cents").eq("id", goalId).single();
  const rowA = (apos ?? []).find((r) => r.id === goalId);
  check(
    "A: saved_cents não foi contaminado pelo aporte de B",
    300000,
    Number(goalA?.saved_cents ?? -1),
    Number(goalA?.saved_cents) === 300000 && Number(rowA?.saved_cents) === 300000,
  );

  const { data: budgetsB } = await b.from("budgets").select("limit_cents");
  check("B: nenhum limite de A visível em budgets", 0, budgetsB?.length ?? 0, (budgetsB?.length ?? 0) === 0);

  const { data: statusB, error: eStatusB } = await b.rpc("budget_status", { p_month: MONTH_SRC });
  migrationHint(eStatusB);
  const comLimite = (statusB ?? []).filter((r) => r.limit_cents !== null);
  check("B: budget_status só mostra limites próprios", 0, comLimite.length, comLimite.length === 0);

  const { data: copiedB, error: eCopyB } = await b.rpc("copy_budget", {
    p_from: MONTH_SRC,
    p_to: MONTH_DEST,
  });
  migrationHint(eCopyB);
  check("B: copy_budget não copia limites de A", 0, Number(copiedB), Number(copiedB) === 0);
}

// --- limpeza e resumo --------------------------------------------------------
await clearBudgets(a);
await clearBudgets(b);
await clearTestGoals(a);
await clearTestGoals(b);

const falhas = results.filter((r) => !r.ok);
console.log("\n==============================================");
console.log(`Verificações: ${results.length} | PASS: ${results.length - falhas.length} | FAIL: ${falhas.length}`);
if (falhas.length > 0) {
  console.log("Falhas:");
  for (const f of falhas) console.log(`  - ${f.name}`);
}
process.exit(falhas.length > 0 ? 1 : 0);
