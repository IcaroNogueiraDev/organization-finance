import { describe, expect, it } from "vitest";
import {
  compareCategoryTotals,
  detectSmallRecurring,
  fixedExpenseShare,
  sumCategoryTotals,
  topGrowth,
  type CategoryTotal,
  type RecurringCandidate,
} from "@/lib/ai/insights";

describe("compareCategoryTotals", () => {
  it("calcula delta e % de crescimento entre meses", () => {
    const growths = compareCategoryTotals(
      [{ name: "Alimentação", totalCents: 80_000 }],
      [{ name: "Alimentação", totalCents: 120_000 }],
    );

    expect(growths).toHaveLength(1);
    expect(growths[0]).toMatchObject({
      category: "Alimentação",
      previousCents: 80_000,
      currentCents: 120_000,
      deltaCents: 40_000,
      growthPercent: 50,
    });
  });

  it("ordena do maior para o menor crescimento (aceite da fase)", () => {
    const growths = compareCategoryTotals(
      [
        { name: "Transporte", totalCents: 50_000 },
        { name: "Alimentação", totalCents: 80_000 },
        { name: "Lazer", totalCents: 30_000 },
      ],
      [
        { name: "Transporte", totalCents: 55_000 },
        { name: "Alimentação", totalCents: 130_000 },
        { name: "Lazer", totalCents: 25_000 },
      ],
    );

    expect(topGrowth(growths)).toMatchObject({
      category: "Alimentação",
      deltaCents: 50_000,
      growthPercent: 62.5,
    });
    expect(growths.map((g) => g.category)).toEqual([
      "Alimentação",
      "Transporte",
      "Lazer",
    ]);
  });

  it("categoria só no mês atual conta como alta (percentual null)", () => {
    const growths = compareCategoryTotals([], [
      { name: "Saúde", totalCents: 15_000 },
    ]);

    expect(growths[0]).toMatchObject({
      category: "Saúde",
      previousCents: 0,
      deltaCents: 15_000,
      growthPercent: null,
    });
  });

  it("categoria só no mês anterior conta como queda", () => {
    const growths = compareCategoryTotals(
      [{ name: "Viagem", totalCents: 200_000 }],
      [],
    );

    expect(growths[0]).toMatchObject({
      category: "Viagem",
      currentCents: 0,
      deltaCents: -200_000,
      growthPercent: -100,
    });
  });

  it("mês sem dados não cresce", () => {
    expect(compareCategoryTotals([], [])).toEqual([]);
  });
});

describe("topGrowth", () => {
  it("devolve null quando nada cresceu", () => {
    const growths = compareCategoryTotals(
      [{ name: "Lazer", totalCents: 30_000 }],
      [{ name: "Lazer", totalCents: 20_000 }],
    );
    expect(topGrowth(growths)).toBeNull();
  });

  it("ignora quedas mesmo sem crescimentos alternativos", () => {
    expect(topGrowth([])).toBeNull();
  });
});

describe("detectSmallRecurring", () => {
  const base: RecurringCandidate[] = [
    { description: "Streaming", amountCents: 3_990, monthKey: "2026-07" },
    { description: "streaming", amountCents: 3_990, monthKey: "2026-08" },
    { description: "  Streaming ", amountCents: 4_190, monthKey: "2026-09" },
  ];

  it("agrupa por descrição normalizada em meses distintos", () => {
    const result = detectSmallRecurring(base);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "streaming",
      label: "Streaming",
      months: 3,
      averageCents: 4_057,
    });
  });

  it("ignora valor acima do teto de gasto pequeno", () => {
    const result = detectSmallRecurring(
      [
        { description: "Aluguel", amountCents: 1_500_000, monthKey: "2026-07" },
        { description: "Aluguel", amountCents: 1_500_000, monthKey: "2026-08" },
      ],
      { maxCents: 10_000 },
    );
    expect(result).toEqual([]);
  });

  it("exige pelo menos 2 meses distintos (repetição no mesmo mês não conta)", () => {
    const result = detectSmallRecurring([
      { description: "Café", amountCents: 1_500, monthKey: "2026-09" },
      { description: "Café", amountCents: 1_500, monthKey: "2026-09" },
    ]);
    expect(result).toEqual([]);
  });

  it("descarta valores muito variáveis entre os meses", () => {
    const result = detectSmallRecurring([
      { description: "Farmácia", amountCents: 2_000, monthKey: "2026-07" },
      { description: "Farmácia", amountCents: 9_000, monthKey: "2026-08" },
      { description: "Farmácia", amountCents: 2_100, monthKey: "2026-09" },
    ]);
    expect(result).toEqual([]);
  });

  it("ignora lançamentos sem descrição ou sem valor", () => {
    const result = detectSmallRecurring([
      { description: null, amountCents: 2_000, monthKey: "2026-07" },
      { description: "   ", amountCents: 2_000, monthKey: "2026-08" },
      { description: "Sem valor", amountCents: 0, monthKey: "2026-08" },
    ]);
    expect(result).toEqual([]);
  });

  it("ordena por meses e depois pelo valor médio", () => {
    const result = detectSmallRecurring([
      { description: "Ônibus", amountCents: 6_000, monthKey: "2026-07" },
      { description: "Ônibus", amountCents: 6_000, monthKey: "2026-08" },
      { description: "Ônibus", amountCents: 6_000, monthKey: "2026-09" },
      { description: "Tinta", amountCents: 9_500, monthKey: "2026-07" },
      { description: "Tinta", amountCents: 9_500, monthKey: "2026-08" },
    ]);

    expect(result.map((r) => r.key)).toEqual(["ônibus", "tinta"]);
  });
});

describe("fixedExpenseShare", () => {
  it("calcula a % da renda", () => {
    expect(fixedExpenseShare(2_000_00, 5_000_00)).toBe(40);
    expect(fixedExpenseShare(1_000_00, 3_000_00)).toBe(33.3);
  });

  it("pode passar de 100% (fixas maiores que a renda)", () => {
    expect(fixedExpenseShare(6_000_00, 5_000_00)).toBe(120);
  });

  it("sem renda não há proporção", () => {
    expect(fixedExpenseShare(1_000_00, 0)).toBeNull();
    expect(fixedExpenseShare(0, 0)).toBeNull();
  });
});

describe("sumCategoryTotals", () => {
  it("soma os totais do mês", () => {
    const categories: CategoryTotal[] = [
      { name: "Alimentação", totalCents: 100 },
      { name: "Lazer", totalCents: 250 },
    ];
    expect(sumCategoryTotals(categories)).toBe(350);
    expect(sumCategoryTotals([])).toBe(0);
  });
});
