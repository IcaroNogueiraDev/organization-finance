import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns";

/** Status de viabilidade do plano de poupança. */
export type ViabilityLevel = "viavel" | "apertado" | "inviavel";

export type ContributionPlan = {
  /** Aporte mensal necessário em centavos. `null` quando não há prazo. */
  requiredCents: number | null;
  remainingCents: number;
  /** Aporte considerado no cálculo (necessário, ou o planejado sem prazo). */
  aporteCents: number | null;
  viability: ViabilityLevel | null;
  /** Saldo livre médio - aporte considerado (positivo = sobra por mês). */
  differenceCents: number | null;
  /** Sem prazo: data estimada de conclusão com o aporte planejado. */
  estimatedDate: string | null;
};

/** Quanto falta para bater o alvo, em centavos (nunca negativo). */
export function remainingCents(targetCents: number, savedCents: number): number {
  return Math.max(targetCents - savedCents, 0);
}

/**
 * Aporte mensal necessário, em centavos (teto — nunca "faltam 1 centavo").
 * - sem prazo (`monthsLeft = null`) devolve `null`: quem informa o aporte é o usuário;
 * - prazo vencido (`monthsLeft <= 0`) devolve o resto integral.
 */
export function requiredMonthlyContribution(
  targetCents: number,
  savedCents: number,
  monthsLeft: number | null,
): number | null {
  const missing = remainingCents(targetCents, savedCents);
  if (missing === 0) return 0;
  if (monthsLeft === null) return null;
  if (monthsLeft <= 0) return missing;
  return Math.ceil(missing / monthsLeft);
}

/**
 * Compara o aporte necessário com a média do saldo livre:
 * Viável ≤ 50% · Apertado 50–90% · Inviável > 90% (ou média ≤ 0).
 */
export function viability(
  requiredCents: number,
  freeBalanceAvgCents: number,
): { level: ViabilityLevel; differenceCents: number } {
  const differenceCents = freeBalanceAvgCents - requiredCents;

  if (requiredCents <= 0) {
    return { level: "viavel", differenceCents };
  }
  if (freeBalanceAvgCents <= 0) {
    return { level: "inviavel", differenceCents };
  }

  const ratio = requiredCents / freeBalanceAvgCents;
  const level: ViabilityLevel =
    ratio <= 0.5 ? "viavel" : ratio <= 0.9 ? "apertado" : "inviavel";
  return { level, differenceCents };
}

/** Média do saldo livre (centavos). Lista vazia -> 0. */
export function freeBalanceAverage(balancesCents: number[]): number {
  if (balancesCents.length === 0) return 0;
  const total = balancesCents.reduce((sum, value) => sum + value, 0);
  return Math.round(total / balancesCents.length);
}

/**
 * Meses de calendário entre hoje e o prazo (igual à coluna `months_left`
 * da função SQL `goal_progress`), nunca negativo.
 */
export function monthsUntil(deadline: string, today: Date): number {
  const months = differenceInCalendarMonths(parseISO(deadline), today);
  return Math.max(months, 0);
}

/**
 * Data estimada de conclusão considerando um aporte mensal fixo.
 * Devolve `null` quando o aporte não cobre o resto ou quando já está no alvo
 * (neste caso devolve o próprio `today`).
 */
export function estimatedCompletionDate(
  targetCents: number,
  savedCents: number,
  monthlyCents: number,
  today: Date,
): string | null {
  const missing = remainingCents(targetCents, savedCents);
  if (missing === 0) return format(today, "yyyy-MM-dd");
  if (monthlyCents <= 0) return null;

  const months = Math.ceil(missing / monthlyCents);
  return format(addMonths(today, months), "yyyy-MM-dd");
}

/**
 * Plano de poupança de uma meta.
 * Com prazo usa o aporte necessário; sem prazo usa o aporte planejado
 * (quando o usuário informar) e devolve a data estimada de conclusão.
 */
export function buildContributionPlan(input: {
  targetCents: number;
  savedCents: number;
  monthsLeft: number | null;
  freeBalanceAvgCents: number;
  /** Aporte mensal desejado, informado pelo usuário quando não há prazo. */
  plannedCents?: number | null;
  today: Date;
}): ContributionPlan {
  const missing = remainingCents(input.targetCents, input.savedCents);
  const requiredCents = requiredMonthlyContribution(
    input.targetCents,
    input.savedCents,
    input.monthsLeft,
  );

  const aporteCents =
    requiredCents ?? (input.plannedCents && input.plannedCents > 0 ? input.plannedCents : null);

  if (aporteCents === null) {
    return {
      requiredCents,
      remainingCents: missing,
      aporteCents: null,
      viability: null,
      differenceCents: null,
      estimatedDate: null,
    };
  }

  const { level, differenceCents } = viability(
    aporteCents,
    input.freeBalanceAvgCents,
  );

  return {
    requiredCents,
    remainingCents: missing,
    aporteCents,
    viability: level,
    differenceCents,
    estimatedDate:
      requiredCents === null
        ? estimatedCompletionDate(
            input.targetCents,
            input.savedCents,
            aporteCents,
            input.today,
          )
        : null,
  };
}
