import { describe, expect, it } from "vitest";
import {
  computeFacts,
  formatAssistantContext,
  negativeBalanceStreak,
  type AssistantData,
} from "@/lib/ai/context";

/** 10/10/2026 (quarta-feira), mês corrente 2026-10. */
const TODAY = "2026-10-10";

function buildData(overrides: Partial<AssistantData> = {}): AssistantData {
  return {
    today: TODAY,
    currentMonth: "2026-10",
    months: [
      { month: "2026-08", incomeCents: 500_000, expenseCents: 450_000, balanceCents: 50_000 },
      { month: "2026-09", incomeCents: 500_000, expenseCents: 470_000, balanceCents: 30_000 },
      { month: "2026-10", incomeCents: 500_000, expenseCents: 300_000, balanceCents: 200_000 },
    ],
    categoryMonths: [
      {
        month: "2026-09",
        categories: [
          { name: "Alimentação", totalCents: 80_000, kind: "variable" },
          { name: "Moradia", totalCents: 150_000, kind: "fixed" },
        ],
      },
      {
        month: "2026-10",
        categories: [
          { name: "Alimentação", totalCents: 130_000, kind: "variable" },
          { name: "Moradia", totalCents: 150_000, kind: "fixed" },
        ],
      },
    ],
    budget: [
      { categoryName: "Alimentação", limitCents: 100_000, spentCents: 130_000, percentUsed: 130 },
      { categoryName: "Lazer", limitCents: 50_000, spentCents: 45_000, percentUsed: 90 },
    ],
    goals: [
      {
        name: "Viagem",
        targetCents: 600_000,
        savedCents: 150_000,
        percent: 25,
        remainingCents: 450_000,
        deadline: "2027-10-01",
        monthsLeft: 12,
        status: "active",
      },
    ],
    recurring: [
      { key: "streaming", label: "Streaming", averageCents: 3_990, months: 3 },
    ],
    missing: [],
    ...overrides,
  };
}

describe("computeFacts", () => {
  it("identifica a categoria que mais cresceu (critério de aceite)", () => {
    const facts = computeFacts(buildData());

    expect(facts.topGrowth).toMatchObject({
      category: "Alimentação",
      previousCents: 80_000,
      currentCents: 130_000,
      deltaCents: 50_000,
      growthPercent: 62.5,
    });
    expect(facts.previousMonth).toBe("2026-09");
    expect(facts.currentMonthExpenseCents).toBe(300_000);
    expect(facts.currentIncomeCents).toBe(500_000);
  });

  it("calcula a projeção do mês corrente e a % de fixas na renda", () => {
    const facts = computeFacts(buildData());

    // R$ 3.000,00 em 10 dias de outubro (31) = R$ 9.300,00
    expect(facts.projectedCents).toBe(930_000);
    // Moradia fixa R$ 1.500,00 sobre renda R$ 5.000,00 = 30%
    expect(facts.fixedSharePercent).toBe(30);
  });

  it("sem renda não calcula a proporção de fixas", () => {
    const data = buildData();
    const semRenda: AssistantData = {
      ...data,
      months: data.months.map((m) => ({ ...m, incomeCents: 0 })),
    };
    expect(computeFacts(semRenda).fixedSharePercent).toBeNull();
  });
});

describe("negativeBalanceStreak", () => {
  it("conta meses seguidos negativos a partir do mais recente", () => {
    expect(
      negativeBalanceStreak([
        { month: "2026-06", incomeCents: 0, expenseCents: 0, balanceCents: -1 },
        { month: "2026-07", incomeCents: 0, expenseCents: 0, balanceCents: -1 },
        { month: "2026-08", incomeCents: 0, expenseCents: 0, balanceCents: 10 },
        { month: "2026-09", incomeCents: 0, expenseCents: 0, balanceCents: -1 },
        { month: "2026-10", incomeCents: 0, expenseCents: 0, balanceCents: -1 },
      ]),
    ).toBe(2);
  });

  it("sem negativos no fim da série não conta", () => {
    expect(
      negativeBalanceStreak([
        { month: "2026-10", incomeCents: 0, expenseCents: 0, balanceCents: 5 },
      ]),
    ).toBe(0);
  });
});

describe("formatAssistantContext", () => {
  it("inclui a categoria que mais cresceu e o valor (aceite da fase)", () => {
    const block = formatAssistantContext(buildData());

    expect(block).toContain("Maior crescimento: Alimentação");
    expect(block).toContain("R$ 800,00 -> R$ 1.300,00 (R$ 500,00, +62,5%)");
    expect(block).toContain("Hoje é 2026-10-10");
  });

  it("mostra alertas de orçamento estourado e de atenção", () => {
    const block = formatAssistantContext(buildData());

    expect(block).toContain("Orçamento estourado em Alimentação (130%)");
    expect(block).toContain("Lazer em 90% do limite");
  });

  it("sinaliza projeção acima da receita (risco de déficit)", () => {
    const block = formatAssistantContext(buildData());

    expect(block).toContain("Projeção de fim de mês R$ 9.300,00 acima da receita");
  });

  it("lista metas com aporte sugerido e gastos recorrentes", () => {
    const block = formatAssistantContext(buildData());

    expect(block).toContain(
      "- Viagem [active]: R$ 1.500,00 de R$ 6.000,00 (25%), faltam R$ 4.500,00, prazo 2027-10-01, aporte sugerido R$ 375,00/mês",
    );
    expect(block).toContain("- Streaming: cerca de R$ 39,90 por mês, presente em 3 meses");
  });

  it("avisa quando faltam seções de dado", () => {
    const block = formatAssistantContext(buildData({ missing: ["orçamento", "metas"] }));

    expect(block).toContain("Seções sem dado nesta resposta");
    expect(block).toContain("orçamento, metas");
  });

  it("não contém dados pessoais (nome, e-mail) — só agregados", () => {
    const block = formatAssistantContext(buildData());

    expect(block).not.toContain("@");
    expect(block).not.toContain("seed-a");
    expect(block).not.toMatch(/e-?mail/i);
  });

  it("mês sem despesas não quebra o bloco", () => {
    const block = formatAssistantContext(
      buildData({
        categoryMonths: [{ month: "2026-10", categories: [] }],
        budget: [],
        goals: [],
        recurring: [],
      }),
    );

    expect(block).toContain("Sem despesas lançadas no mês.");
    expect(block).toContain("Nenhuma meta cadastrada.");
    expect(block).toContain("Sem limites definidos para o mês.");
    expect(block).toContain("Nenhuma categoria cresceu em relação ao mês anterior.");
  });
});
