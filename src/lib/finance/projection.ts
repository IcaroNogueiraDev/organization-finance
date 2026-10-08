import { getDaysInMonth, parseISO } from "date-fns";

/** Chave de mês ("yyyy-MM") -> dias totais do mês. */
export function daysInMonth(monthKey: string): number {
  return getDaysInMonth(parseISO(`${monthKey}-01`));
}

export type ProjectionInput = {
  /** "yyyy-MM" do mês analisado. */
  monthKey: string;
  /** Gasto acumulado até agora, em centavos. */
  spentCents: number;
  /** Data de referência (padrão: hoje). */
  today: Date;
};

/**
 * Projeção de gasto até o fim do mês = gasto atual / dias decorridos * dias do mês.
 * Mês passado e mês futuro devolvem `null`: não há o que projetar.
 */
export function projectedMonthEnd(input: ProjectionInput): number | null {
  const monthStart = parseISO(`${input.monthKey}-01`);
  const currentMonth = new Date(input.today.getFullYear(), input.today.getMonth(), 1);

  const isCurrent =
    monthStart.getFullYear() === currentMonth.getFullYear() &&
    monthStart.getMonth() === currentMonth.getMonth();

  if (!isCurrent) return null;

  const daysElapsed = input.today.getDate();
  if (daysElapsed <= 0) return null;

  const total = daysInMonth(input.monthKey);
  if (total <= 0) return null;

  return Math.round((input.spentCents / daysElapsed) * total);
}

/** A projeção estouraria o limite? */
export function willExceedLimit(
  projectedCents: number | null,
  limitCents: number | null,
): boolean {
  if (projectedCents === null || limitCents === null) return false;
  if (limitCents <= 0) return false;
  return projectedCents > limitCents;
}
