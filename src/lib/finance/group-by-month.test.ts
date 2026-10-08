import { describe, expect, it } from "vitest";
import { groupTransactionsByMonth } from "@/lib/finance/group-by-month";

describe("groupTransactionsByMonth", () => {
  it("agrupa receitas e despesas por mês", () => {
    const result = groupTransactionsByMonth([
      { type: "income", amount_cents: 500000, occurred_on: "2026-08-10" },
      { type: "expense", amount_cents: 120000, occurred_on: "2026-08-15" },
      { type: "expense", amount_cents: 80000, occurred_on: "2026-09-01" },
      { type: "income", amount_cents: 300000, occurred_on: "2026-09-20" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      month: "2026-08",
      incomeCents: 500000,
      expenseCents: 120000,
      balanceCents: 380000,
      count: 2,
    });
    expect(result[1]).toEqual({
      month: "2026-09",
      incomeCents: 300000,
      expenseCents: 80000,
      balanceCents: 220000,
      count: 2,
    });
  });

  it("ordena do mês mais antigo para o mais recente", () => {
    const result = groupTransactionsByMonth([
      { type: "expense", amount_cents: 100, occurred_on: "2026-10-05" },
      { type: "expense", amount_cents: 100, occurred_on: "2026-06-05" },
      { type: "expense", amount_cents: 100, occurred_on: "2026-08-05" },
    ]);

    expect(result.map((bucket) => bucket.month)).toEqual([
      "2026-06",
      "2026-08",
      "2026-10",
    ]);
  });

  it("não desloca a data por causa do fuso horário", () => {
    const result = groupTransactionsByMonth([
      { type: "income", amount_cents: 100, occurred_on: "2026-03-01" },
      { type: "income", amount_cents: 100, occurred_on: "2026-03-31" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.month).toBe("2026-03");
  });

  it("retorna lista vazia sem transações", () => {
    expect(groupTransactionsByMonth([])).toEqual([]);
  });
});
