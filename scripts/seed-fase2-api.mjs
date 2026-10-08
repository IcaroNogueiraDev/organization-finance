// Seed da Fase 2 pela API (caminho do app: login + PostgREST com RLS).
// Alternativa ao supabase/seed_fase2.sql — útil quando o login já funciona.
// Uso: npm run seed:fase2   (idempotente: apaga e recria as transações dos usuários seed)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const USERS = [
  { email: "seed-a@orgfinance.dev", password: "SeedFase2!2026" },
  { email: "seed-b@orgfinance.dev", password: "SeedFase2!2026" },
];

const CATEGORIES = [
  { name: "Salário", type: "income", kind: null, color: "#16a34a" },
  { name: "Freelance", type: "income", kind: null, color: "#22c55e" },
  { name: "Outras receitas", type: "income", kind: null, color: "#4ade80" },
  { name: "Moradia", type: "expense", kind: "fixed", color: "#ef4444" },
  { name: "Alimentação", type: "expense", kind: "variable", color: "#f97316" },
  { name: "Transporte", type: "expense", kind: "variable", color: "#eab308" },
  { name: "Saúde", type: "expense", kind: "essential", color: "#06b6d4" },
  { name: "Educação", type: "expense", kind: "essential", color: "#3b82f6" },
  { name: "Lazer", type: "expense", kind: "non_essential", color: "#a855f7" },
  { name: "Compras", type: "expense", kind: "non_essential", color: "#ec4899" },
  { name: "Assinaturas", type: "expense", kind: "fixed", color: "#8b5cf6" },
  { name: "Outras despesas", type: "expense", kind: "variable", color: "#64748b" },
];

const TX = [
  // 2026-08 (7)
  ["Salário", "income", 350000, "Salário agosto", "2026-08-01"],
  ["Moradia", "expense", 120000, "Aluguel agosto", "2026-08-05"],
  ["Alimentação", "expense", 45500, "Supermercado", "2026-08-07"],
  [null, "expense", 12000, "Combustível (sem categoria)", "2026-08-12"],
  ["Freelance", "income", 80000, "Freelance projeto X", "2026-08-15"],
  ["Saúde", "expense", 9900, "Consulta médica", "2026-08-20"],
  ["Lazer", "expense", 6000, "Cinema", "2026-08-28"],
  // 2026-09 (7)
  ["Salário", "income", 350000, "Salário setembro", "2026-09-01"],
  ["Moradia", "expense", 120000, "Aluguel setembro", "2026-09-03"],
  ["Alimentação", "expense", 31200, "Feira", "2026-09-08"],
  ["Assinaturas", "expense", 5500, "Streaming", "2026-09-10"],
  ["Educação", "expense", 19900, "Curso online", "2026-09-14"],
  ["Compras", "expense", 24990, "Tênis", "2026-09-18"],
  ["Transporte", "expense", 8000, "Ônibus e metrô", "2026-09-25"],
  // 2026-10 (6)
  ["Salário", "income", 350000, "Salário outubro", "2026-10-01"],
  ["Moradia", "expense", 120000, "Aluguel outubro", "2026-10-01"],
  ["Alimentação", "expense", 27800, "Mercado", "2026-10-02"],
  ["Transporte", "expense", 15000, "Gasolina", "2026-10-03"],
  ["Saúde", "expense", 13200, "Farmácia", "2026-10-04"],
  ["Freelance", "income", 45000, "Freelance projeto Y", "2026-10-04"],
];

const TX_B = [
  ["Salário", "income", 100000, "Salário B setembro", "2026-09-05"],
  ["Alimentação", "expense", 50000, "Mercado B", "2026-09-06"],
  ["Lazer", "expense", 30000, "Show B", "2026-10-02"],
];

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function login(who) {
  const { error } = await client.auth.signInWithPassword(who);
  if (error) throw new Error(`login ${who.email}: ${error.message}`);
}

async function ensureCategories(userId) {
  const { data: existentes, error } = await client.from("categories").select("id, name, type");
  if (error) throw error;
  const chaves = new Set(existentes.map((c) => `${c.name}|${c.type}`));
  const faltando = CATEGORIES.filter((c) => !chaves.has(`${c.name}|${c.type}`));
  if (faltando.length > 0) {
    const { error: e2 } = await client
      .from("categories")
      .insert(faltando.map((c) => ({ ...c, user_id: userId })));
    if (e2) throw e2;
  }
  const { data: todas, error: e3 } = await client.from("categories").select("id, name, type");
  if (e3) throw e3;
  return new Map(todas.map((c) => [`${c.name}|${c.type}`, c.id]));
}

async function seedTransactions(userId, rows, mapa) {
  const { error: del } = await client.from("transactions").delete().eq("user_id", userId);
  if (del) throw del;
  const payload = rows.map(([cat, type, amount, description, occurred_on]) => ({
    user_id: userId,
    category_id: cat ? mapa.get(`${cat}|${type}`) ?? null : null,
    type,
    amount_cents: amount,
    description,
    occurred_on,
  }));
  const { error } = await client.from("transactions").insert(payload);
  if (error) throw error;
  return payload.length;
}

const resumo = [];
for (const [i, user] of USERS.entries()) {
  await login(user);
  const { data: { user: u } } = await client.auth.getUser();
  const mapa = await ensureCategories(u.id);
  const { count: catCount } = await client.from("categories").select("*", { count: "exact", head: true });
  const rows = i === 0 ? TX : TX_B;
  const n = await seedTransactions(u.id, rows, mapa);
  const { count: txCount } = await client.from("transactions").select("*", { count: "exact", head: true });
  resumo.push({ email: user.email, categorias: catCount, transacoes_inseridas: n, transacoes_banco: txCount });
}

console.table(resumo);
const { count: a } = await client.from("transactions").select("*", { count: "exact", head: true });
console.log(`Total visível para o último usuário logado: ${a}`);
