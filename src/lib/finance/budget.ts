/** Tom da barra de progresso do orçamento. */
export type BudgetTone = "ok" | "atencao" | "estouro";

export const BUDGET_TONE_THRESHOLD = 80;

/**
 * Percentual usado do limite (0–100+).
 * Sem limite (`null`) ou limite ≤ 0 (divisão por zero) -> `null`.
 */
export function budgetPercentUsed(
  spentCents: number,
  limitCents: number | null,
): number | null {
  if (limitCents === null || limitCents <= 0) return null;
  return Math.round((100 * spentCents) / limitCents * 10) / 10;
}

/**
 * Verde < 80% · Amarelo 80–99% · Vermelho ≥ 100%.
 * Percentual `null` (sem limite) -> `null` (sem barra colorida).
 */
export function budgetTone(percentUsed: number | null): BudgetTone | null {
  if (percentUsed === null) return null;
  if (percentUsed >= 100) return "estouro";
  if (percentUsed >= BUDGET_TONE_THRESHOLD) return "atencao";
  return "ok";
}

/** Categorias que cruzaram 80% do limite (critério 5 do painel). */
export function countBudgetAlerts(percentValues: (number | null)[]): number {
  return percentValues.filter(
    (percent) => percent !== null && percent >= BUDGET_TONE_THRESHOLD,
  ).length;
}

/** Soma dos limites definidos (linhas sem limite entram como 0). */
export function totalLimitCents(limitValues: (number | null)[]): number {
  return limitValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}
