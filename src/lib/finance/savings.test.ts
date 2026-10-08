import { describe, expect, it } from "vitest";
import {
  buildContributionPlan,
  estimatedCompletionDate,
  freeBalanceAverage,
  monthsUntil,
  remainingCents,
  requiredMonthlyContribution,
  viability,
} from "@/lib/finance/savings";

const TODAY = new Date(2026, 9, 4); // 04/10/2026

describe("remainingCents", () => {
  it("nunca fica negativo", () => {
    expect(remainingCents(600000, 200000)).toBe(400000);
    expect(remainingCents(600000, 600000)).toBe(0);
    expect(remainingCents(600000, 900000)).toBe(0);
  });
});

describe("requiredMonthlyContribution", () => {
  it("meta de R$ 6.000 em 12 meses dá R$ 500/mês (critério 1)", () => {
    expect(requiredMonthlyContribution(600000, 0, 12)).toBe(50000);
  });

  it("divide desigual arredondando para cima (nunca falta centavo)", () => {
    const required = requiredMonthlyContribution(100000, 0, 3) ?? Number.NaN;
    expect(required).toBe(33334);
    expect(required * 3).toBeGreaterThanOrEqual(100000);
  });

  it("desconta o que já foi guardado", () => {
    expect(requiredMonthlyContribution(600000, 300000, 6)).toBe(50000);
  });

  it("sem prazo devolve null (é o usuário quem informa o aporte)", () => {
    expect(requiredMonthlyContribution(600000, 0, null)).toBeNull();
  });

  it("prazo vencido cobra o resto integral", () => {
    expect(requiredMonthlyContribution(600000, 100000, 0)).toBe(500000);
    expect(requiredMonthlyContribution(600000, 100000, -3)).toBe(500000);
  });

  it("meta já concluída cobra zero", () => {
    expect(requiredMonthlyContribution(600000, 600000, 12)).toBe(0);
  });
});

describe("viability", () => {
  it("Viável até 50% da média do saldo livre", () => {
    expect(viability(50000, 100000).level).toBe("viavel");
    expect(viability(50000, 100000).differenceCents).toBe(50000);
  });

  it("Apertado entre 50% e 90%", () => {
    expect(viability(60000, 100000).level).toBe("apertado");
    expect(viability(90000, 100000).level).toBe("apertado");
  });

  it("Inviável acima de 90% ou com saldo livre zerado", () => {
    expect(viability(91000, 100000).level).toBe("inviavel");
    expect(viability(50000, 0).level).toBe("inviavel");
    expect(viability(50000, -20000).level).toBe("inviavel");
    expect(viability(50000, -20000).differenceCents).toBe(-70000);
  });

  it("Aporte zero é sempre viável", () => {
    expect(viability(0, 0).level).toBe("viavel");
  });
});

describe("freeBalanceAverage", () => {
  it("faz a média dos últimos meses", () => {
    expect(freeBalanceAverage([100000, 200000, 300000])).toBe(200000);
  });

  it("lista vazia é zero", () => {
    expect(freeBalanceAverage([])).toBe(0);
  });
});

describe("monthsUntil", () => {
  it("calcula meses de calendário até o prazo", () => {
    expect(monthsUntil("2027-10-04", TODAY)).toBe(12);
    expect(monthsUntil("2026-11-15", TODAY)).toBe(1);
  });

  it("prazo no passado não fica negativo", () => {
    expect(monthsUntil("2025-01-01", TODAY)).toBe(0);
  });
});

describe("estimatedCompletionDate", () => {
  it("com R$ 500/mês conclui em 12 meses", () => {
    expect(estimatedCompletionDate(600000, 0, 50000, TODAY)).toBe("2027-10-04");
  });

  it("aporte zero nunca chega ao alvo", () => {
    expect(estimatedCompletionDate(600000, 0, 0, TODAY)).toBeNull();
  });

  it("meta concluída tem data de hoje", () => {
    expect(estimatedCompletionDate(600000, 600000, 10000, TODAY)).toBe("2026-10-04");
  });
});

describe("buildContributionPlan", () => {
  it("com prazo usa o aporte necessário e não projeta data", () => {
    const plan = buildContributionPlan({
      targetCents: 600000,
      savedCents: 0,
      monthsLeft: 12,
      freeBalanceAvgCents: 150000,
      today: TODAY,
    });

    expect(plan.requiredCents).toBe(50000);
    expect(plan.aporteCents).toBe(50000);
    expect(plan.viability).toBe("viavel");
    expect(plan.differenceCents).toBe(100000);
    expect(plan.estimatedDate).toBeNull();
  });

  it("sem prazo usa o aporte planejado e projeta a data", () => {
    const plan = buildContributionPlan({
      targetCents: 600000,
      savedCents: 0,
      monthsLeft: null,
      freeBalanceAvgCents: 100000,
      plannedCents: 60000,
      today: TODAY,
    });

    expect(plan.requiredCents).toBeNull();
    expect(plan.aporteCents).toBe(60000);
    expect(plan.viability).toBe("apertado");
    expect(plan.estimatedDate).toBe("2027-08-04"); // 10 aportes de R$ 600
  });

  it("sem prazo e sem aporte planejado não tem status", () => {
    const plan = buildContributionPlan({
      targetCents: 600000,
      savedCents: 100000,
      monthsLeft: null,
      freeBalanceAvgCents: 60000,
      today: TODAY,
    });

    expect(plan.aporteCents).toBeNull();
    expect(plan.viability).toBeNull();
    expect(plan.estimatedDate).toBeNull();
    expect(plan.remainingCents).toBe(500000);
  });
});
