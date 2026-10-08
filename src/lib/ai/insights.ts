/**
 * Insights puros do assistente (Fase 4).
 *
 * Tudo aqui é calculado em código: a IA só recebe os números já prontos e se
 * limita a explicá-los (PLANO.md, Fase 4 — "calculado em código, a IA só
 * explica"). Nenhum dado identificável passa por aqui: só valores em centavos,
 * nomes de categoria e chaves de mês ("yyyy-MM").
 */

export type CategoryTotal = {
  /** Nome da categoria de despesa. */
  name: string;
  /** Total gasto no mês, em centavos. */
  totalCents: number;
};

/** Totais de um mês por categoria. */
export type MonthTotals = {
  /** "yyyy-MM". */
  month: string;
  categories: readonly CategoryTotal[];
};

export type CategoryGrowth = {
  category: string;
  previousCents: number;
  currentCents: number;
  /** current - positive quando cresceu, negativo quando caiu. */
  deltaCents: number;
  /** % de variação sobre o mês anterior; null quando o anterior era 0. */
  growthPercent: number | null;
};

/**
 * Compara o mês atual com o anterior, categoria a categoria.
 * Categorias presentes em só um dos meses entram com total 0 no outro.
 * Ordenado do maior para o menor crescimento (`deltaCents`).
 */
export function compareCategoryTotals(
  previous: readonly CategoryTotal[],
  current: readonly CategoryTotal[],
): CategoryGrowth[] {
  const prev = new Map(previous.map((c) => [c.name, c.totalCents]));
  const curr = new Map(current.map((c) => [c.name, c.totalCents]));
  const names = new Set([...prev.keys(), ...curr.keys()]);

  const growths: CategoryGrowth[] = [];
  for (const name of names) {
    const previousCents = prev.get(name) ?? 0;
    const currentCents = curr.get(name) ?? 0;
    growths.push({
      category: name,
      previousCents,
      currentCents,
      deltaCents: currentCents - previousCents,
      growthPercent:
        previousCents > 0
          ? Math.round(((currentCents - previousCents) / previousCents) * 1000) / 10
          : null,
    });
  }

  return growths.sort((a, b) => b.deltaCents - a.deltaCents);
}

/** Categoria que mais cresceu (maior delta positivo); null se nada cresceu. */
export function topGrowth(
  growths: readonly CategoryGrowth[],
): CategoryGrowth | null {
  const positive = growths.filter((g) => g.deltaCents > 0);
  if (positive.length === 0) return null;
  return positive.reduce((best, g) => (g.deltaCents > best.deltaCents ? g : best));
}

export type SmallRecurringExpense = {
  /** Chave de agrupamento (descrição normalizada). */
  key: string;
  /** Descrição como o usuário escreveu (a mais frequente). */
  label: string;
  /** Média arredondada em centavos. */
  averageCents: number;
  /** Meses distintos em que apareceu. */
  months: number;
};

export type SmallRecurringOptions = {
  /** Valor máximo de cada lançamento para ser considerado "pequeno". */
  maxCents?: number;
  /** Mínimo de meses distintos. */
  minMonths?: number;
  /** Variação tolerada entre o maior e o menor valor (0–1). */
  tolerance?: number;
};

export type RecurringCandidate = {
  description: string | null;
  amountCents: number;
  /** "yyyy-MM" do lançamento. */
  monthKey: string;
};

const DEFAULT_MAX_CENTS = 10_000; // R$ 100,00
const DEFAULT_MIN_MONTHS = 2;
const DEFAULT_TOLERANCE = 0.2;

function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Gastos pequenos recorrentes: mesma descrição em vários meses, valores
 * parecidos (até `tolerance` de variação entre o maior e o menor).
 * Sem descrição não há como agrupar — esses lançamentos são ignorados.
 */
export function detectSmallRecurring(
  transactions: readonly RecurringCandidate[],
  options: SmallRecurringOptions = {},
): SmallRecurringExpense[] {
  const maxCents = options.maxCents ?? DEFAULT_MAX_CENTS;
  const minMonths = options.minMonths ?? DEFAULT_MIN_MONTHS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  const groups = new Map<
    string,
    { label: string; amounts: number[]; months: Set<string> }
  >();

  for (const tx of transactions) {
    if (!tx.description || tx.amountCents <= 0 || tx.amountCents > maxCents) {
      continue;
    }
    const key = normalizeDescription(tx.description);
    if (key.length === 0) continue;

    const group = groups.get(key);
    if (group) {
      group.amounts.push(tx.amountCents);
      group.months.add(tx.monthKey);
    } else {
      groups.set(key, {
        label: tx.description.trim().replace(/\s+/g, " "),
        amounts: [tx.amountCents],
        months: new Set([tx.monthKey]),
      });
    }
  }

  const results: SmallRecurringExpense[] = [];
  for (const [key, group] of groups) {
    if (group.months.size < minMonths) continue;

    const min = Math.min(...group.amounts);
    const max = Math.max(...group.amounts);
    if (max > 0 && (max - min) / max > tolerance) continue;

    results.push({
      key,
      label: group.label,
      averageCents: Math.round(
        group.amounts.reduce((sum, value) => sum + value, 0) / group.amounts.length,
      ),
      months: group.months.size,
    });
  }

  return results.sort((a, b) => {
    if (b.months !== a.months) return b.months - a.months;
    return b.averageCents - a.averageCents;
  });
}

/**
 * Despesas fixas como % da renda (0–100+; pode passar de 100).
 * Sem renda no período -> null (não dá para calcular a proporção).
 */
export function fixedExpenseShare(
  fixedExpenseCents: number,
  incomeCents: number,
): number | null {
  if (incomeCents <= 0) return null;
  return Math.round((100 * fixedExpenseCents) / incomeCents * 10) / 10;
}

/** Soma de totais por categoria. */
export function sumCategoryTotals(categories: readonly CategoryTotal[]): number {
  return categories.reduce((sum, c) => sum + c.totalCents, 0);
}
