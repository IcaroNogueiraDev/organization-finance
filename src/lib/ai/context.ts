import { parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  compareCategoryTotals,
  detectSmallRecurring,
  fixedExpenseShare,
  sumCategoryTotals,
  topGrowth,
  type CategoryTotal,
  type RecurringCandidate,
  type SmallRecurringExpense,
} from "@/lib/ai/insights";
import { formatMonthLabel, monthKeyToFirstDay, toMonthKey } from "@/lib/finance/dates";
import { centsToBrl } from "@/lib/finance/money";
import { projectedMonthEnd } from "@/lib/finance/projection";
import { requiredMonthlyContribution } from "@/lib/finance/savings";

/**
 * Resumos agregados do usuário para o prompt do assistente (Fase 4).
 *
 * Regra 6 (nunca expor segredos) e PLANO.md ("nunca enviar nome/e-mail do
 * usuário ao modelo"): aqui só entram números, nomes de categoria, chaves de
 * mês e nomes de meta — nenhum identificador pessoal.
 */

type Supabase = SupabaseClient<Database>;

/** Meses de série e de despesa por categoria enviados ao modelo. */
export const CONTEXT_MONTHS = 6;

/** Janela dos gastos pequenos recorrentes. */
export const RECURRING_MONTHS = 3;

export type MonthSummary = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};

export type CategoryMonth = {
  month: string;
  categories: readonly (CategoryTotal & { kind: string | null })[];
};

export type BudgetLine = {
  categoryName: string;
  limitCents: number | null;
  spentCents: number;
  percentUsed: number | null;
};

export type GoalLine = {
  name: string;
  targetCents: number;
  savedCents: number;
  percent: number;
  remainingCents: number;
  deadline: string | null;
  monthsLeft: number | null;
  status: string;
};

export type AssistantData = {
  /** "yyyy-MM-dd". */
  today: string;
  /** "yyyy-MM" do mês corrente. */
  currentMonth: string;
  months: readonly MonthSummary[];
  categoryMonths: readonly CategoryMonth[];
  budget: readonly BudgetLine[];
  goals: readonly GoalLine[];
  recurring: readonly SmallRecurringExpense[];
  /** Seções que falharam — o prompt diz ao modelo que o dado está faltando. */
  missing: readonly string[];
};

type SeriesRow = {
  month: string;
  income_cents: number;
  expense_cents: number;
  balance_cents: number;
};

type CategoryRow = {
  category_name: string;
  kind: string | null;
  total_cents: number;
};

type BudgetRowDb = {
  category_name: string;
  limit_cents: number | null;
  spent_cents: number;
  percent_used: number | null;
};

type GoalRowDb = {
  name: string;
  target_cents: number;
  saved_cents: number;
  percent: number;
  remaining_cents: number;
  deadline: string | null;
  months_left: number | null;
  status: string;
};

/** Executa uma consulta e registra a falha em `missing` em vez de quebrar tudo. */
async function safeSection<T>(
  label: string,
  missing: string[],
  fallback: T,
  query: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  try {
    const { data, error } = await query();
    if (error) {
      missing.push(label);
      return fallback;
    }
    return data ?? fallback;
  } catch {
    missing.push(label);
    return fallback;
  }
}

function rowMonthKey(monthDate: string): string {
  return monthDate.slice(0, 7);
}

/**
 * Busca os resumos agregados com o client da sessão do usuário (RLS vale).
 * Falhas parciais viram `missing`, não em erro: o prompt instrui o modelo a
 * dizer quando um dado não está disponível.
 */
export async function fetchAssistantData(
  supabase: Supabase,
  today: Date,
): Promise<AssistantData> {
  const currentMonth = toMonthKey(today);
  const missing: string[] = [];

  const series = await safeSection<SeriesRow[]>("série mensal", missing, [], () =>
    supabase.rpc("monthly_series", { p_months: CONTEXT_MONTHS }),
  );

  const monthKeys =
    series.length > 0 ? series.map((row) => rowMonthKey(row.month)) : [currentMonth];

  const categoryMonths: CategoryMonth[] = [];
  for (const month of monthKeys) {
    const rows = await safeSection<CategoryRow[]>(
      `despesa por categoria (${month})`,
      missing,
      [],
      () =>
        supabase.rpc("expenses_by_category", {
          p_month: monthKeyToFirstDay(month),
        }),
    );
    categoryMonths.push({
      month,
      categories: rows.map((row) => ({
        name: row.category_name,
        totalCents: Number(row.total_cents),
        kind: row.kind,
      })),
    });
  }

  const budgetRows = await safeSection<BudgetRowDb[]>("orçamento", missing, [], () =>
    supabase.rpc("budget_status", { p_month: monthKeyToFirstDay(currentMonth) }),
  );

  const goalRows = await safeSection<GoalRowDb[]>("metas", missing, [], () =>
    supabase.rpc("goal_progress"),
  );

  const recurringStart = monthKeyToFirstDay(
    toMonthKey(new Date(today.getFullYear(), today.getMonth() - (RECURRING_MONTHS - 1), 1)),
  );
  const txRows = await safeSection<
    { description: string | null; amount_cents: number; occurred_on: string }[]
  >(
    "gastos recorrentes",
    missing,
    [],
    () =>
      supabase
        .from("transactions")
        .select("description, amount_cents, occurred_on")
        .eq("type", "expense")
        .gte("occurred_on", recurringStart)
        .order("occurred_on", { ascending: true })
        .limit(1_000),
  );

  const candidates: RecurringCandidate[] = txRows.map((row) => ({
    description: row.description,
    amountCents: Number(row.amount_cents),
    monthKey: rowMonthKey(row.occurred_on),
  }));

  return {
    today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    currentMonth,
    months: series.map((row) => ({
      month: rowMonthKey(row.month),
      incomeCents: Number(row.income_cents),
      expenseCents: Number(row.expense_cents),
      balanceCents: Number(row.balance_cents),
    })),
    categoryMonths,
    budget: budgetRows.map((row) => ({
      categoryName: row.category_name,
      limitCents: row.limit_cents === null ? null : Number(row.limit_cents),
      spentCents: Number(row.spent_cents),
      percentUsed: row.percent_used === null ? null : Number(row.percent_used),
    })),
    goals: goalRows.map((row) => ({
      name: row.name,
      targetCents: Number(row.target_cents),
      savedCents: Number(row.saved_cents),
      percent: Number(row.percent),
      remainingCents: Number(row.remaining_cents),
      deadline: row.deadline,
      monthsLeft: row.months_left === null ? null : Number(row.months_left),
      status: row.status,
    })),
    recurring: detectSmallRecurring(candidates),
    missing,
  };
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR")}%`;
}

/** Meses seguidos com saldo negativo (contados do mais recente para trás). */
export function negativeBalanceStreak(months: readonly MonthSummary[]): number {
  let streak = 0;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    if (months[i].balanceCents < 0) streak += 1;
    else break;
  }
  return streak;
}

function currentCategories(data: AssistantData): CategoryMonth["categories"] {
  const found = data.categoryMonths.find((c) => c.month === data.currentMonth);
  return found?.categories ?? [];
}

/** Total de despesas de categoria com `kind` no mês corrente. */
function kindTotal(data: AssistantData, kind: string): number {
  return currentCategories(data)
    .filter((c) => c.kind === kind)
    .reduce((sum, c) => sum + c.totalCents, 0);
}

/** Fatos calculados em código — a IA só explica. */
export type ComputedFacts = {
  topGrowth: ReturnType<typeof topGrowth>;
  previousMonth: string | null;
  currentMonthExpenseCents: number;
  currentIncomeCents: number;
  projectedCents: number | null;
  fixedSharePercent: number | null;
  negativeStreak: number;
};

export function computeFacts(data: AssistantData): ComputedFacts {
  const sorted = [...data.categoryMonths].sort((a, b) => a.month.localeCompare(b.month));
  const previous = sorted.at(-2);
  const current = sorted.at(-1);

  const growths =
    previous && current
      ? compareCategoryTotals(
          previous.categories.map((c) => ({ name: c.name, totalCents: c.totalCents })),
          current.categories.map((c) => ({ name: c.name, totalCents: c.totalCents })),
        )
      : [];

  const currentSummary = data.months.find((m) => m.month === data.currentMonth);
  const incomeCents = currentSummary?.incomeCents ?? 0;
  const expenseCents =
    currentSummary?.expenseCents ?? sumCategoryTotals(currentCategories(data));

  const fixedCents = kindTotal(data, "fixed");

  return {
    topGrowth: topGrowth(growths),
    previousMonth: previous?.month ?? null,
    currentMonthExpenseCents: expenseCents,
    currentIncomeCents: incomeCents,
    projectedCents: projectedMonthEnd({
      monthKey: data.currentMonth,
      spentCents: expenseCents,
      today: parseISO(data.today),
    }),
    fixedSharePercent: fixedExpenseShare(fixedCents, incomeCents),
    negativeStreak: negativeBalanceStreak(data.months),
  };
}

/**
 * Bloco de dados agregados em texto pt-BR para o prompt de sistema.
 * Nenhum dado pessoal (nome, e-mail, id) aparece aqui — só agregados.
 */
export function formatAssistantContext(data: AssistantData): string {
  const facts = computeFacts(data);
  const lines: string[] = [];
  const monthLabel = formatMonthLabel(data.currentMonth);

  lines.push(`Hoje é ${data.today} e o mês corrente é ${monthLabel}.`);

  if (data.missing.length > 0) {
    lines.push(
      `Seções sem dado nesta resposta (diga ao usuário que faltam): ${data.missing.join(", ")}.`,
    );
  }

  lines.push("", `### Visão mensal (últimos ${data.months.length} meses)`);
  if (data.months.length === 0) {
    lines.push("- Sem lançamentos ainda.");
  }
  for (const m of data.months) {
    lines.push(
      `- ${formatMonthLabel(m.month)}: receita ${centsToBrl(m.incomeCents)}, despesa ${centsToBrl(m.expenseCents)}, saldo ${centsToBrl(m.balanceCents)}`,
    );
  }

  const currentCats = currentCategories(data);
  lines.push("", `### Despesa por categoria em ${monthLabel}`);
  if (currentCats.length === 0) {
    lines.push("- Sem despesas lançadas no mês.");
  }
  const totalExpense = sumCategoryTotals(currentCats);
  for (const c of currentCats) {
    const share =
      totalExpense > 0
        ? ` (${formatPercent(Math.round((100 * c.totalCents) / totalExpense * 10) / 10)} da despesa do mês)`
        : "";
    lines.push(`- ${c.name}: ${centsToBrl(c.totalCents)}${share}`);
  }

  lines.push("", "### Crescimento por categoria (mês atual vs anterior)");
  if (facts.topGrowth) {
    const g = facts.topGrowth;
    const pct = g.growthPercent === null ? "sem base anterior" : `+${formatPercent(g.growthPercent)}`;
    lines.push(
      `- Maior crescimento: ${g.category}: ${centsToBrl(g.previousCents)} -> ${centsToBrl(g.currentCents)} (${centsToBrl(g.deltaCents)}, ${pct})`,
    );
  } else {
    lines.push("- Nenhuma categoria cresceu em relação ao mês anterior.");
  }

  lines.push("", `### Orçamento de ${monthLabel}`);
  if (data.budget.length === 0) {
    lines.push("- Sem limites definidos para o mês.");
  }
  for (const b of data.budget) {
    const limit = b.limitCents === null ? "sem limite" : `limite ${centsToBrl(b.limitCents)}`;
    const percent =
      b.percentUsed === null ? "" : `, ${formatPercent(b.percentUsed)} do limite`;
    lines.push(`- ${b.categoryName}: gasto ${centsToBrl(b.spentCents)} (${limit}${percent})`);
  }

  lines.push("", "### Metas");
  if (data.goals.length === 0) {
    lines.push("- Nenhuma meta cadastrada.");
  }
  for (const g of data.goals) {
    const prazo = g.deadline ? `, prazo ${g.deadline}` : ", sem prazo";
    const required = requiredMonthlyContribution(
      g.targetCents,
      g.savedCents,
      g.monthsLeft,
    );
    const aporte =
      required !== null && required > 0
        ? `, aporte sugerido ${centsToBrl(required)}/mês`
        : "";
    lines.push(
      `- ${g.name} [${g.status}]: ${centsToBrl(g.savedCents)} de ${centsToBrl(g.targetCents)} (${formatPercent(g.percent)}), faltam ${centsToBrl(g.remainingCents)}${prazo}${aporte}`,
    );
  }

  lines.push("", "### Gastos pequenos recorrentes (cálculo em código)");
  if (data.recurring.length === 0) {
    lines.push("- Nenhum identificado nos últimos meses.");
  }
  for (const r of data.recurring) {
    lines.push(
      `- ${r.label}: cerca de ${centsToBrl(r.averageCents)} por mês, presente em ${r.months} meses`,
    );
  }

  lines.push("", "### Alertas calculados (cálculo em código)");
  const alerts: string[] = [];

  if (
    facts.projectedCents !== null &&
    facts.currentIncomeCents > 0 &&
    facts.projectedCents > facts.currentIncomeCents
  ) {
    alerts.push(
      `Projeção de fim de mês ${centsToBrl(facts.projectedCents)} acima da receita do mês ${centsToBrl(facts.currentIncomeCents)} (risco de déficit).`,
    );
  }

  if (facts.fixedSharePercent !== null && facts.fixedSharePercent >= 50) {
    alerts.push(
      `Despesas fixas consomem ${formatPercent(facts.fixedSharePercent)} da renda do mês.`,
    );
  }

  if (facts.negativeStreak >= 2) {
    alerts.push(`Saldo negativo em ${facts.negativeStreak} meses seguidos.`);
  }

  const over = data.budget.filter((b) => b.percentUsed !== null && b.percentUsed >= 100);
  const near = data.budget.filter(
    (b) => b.percentUsed !== null && b.percentUsed >= 80 && b.percentUsed < 100,
  );
  for (const b of over) {
    alerts.push(`Orçamento estourado em ${b.categoryName} (${formatPercent(b.percentUsed ?? 0)}).`);
  }
  for (const b of near) {
    alerts.push(
      `${b.categoryName} em ${formatPercent(b.percentUsed ?? 0)} do limite (atenção aos 80%).`,
    );
  }

  if (alerts.length === 0) alerts.push("- Nenhum alerta no momento.");
  for (const alert of alerts) lines.push(`- ${alert}`);

  return lines.join("\n");
}
