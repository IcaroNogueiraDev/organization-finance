import { describe, expect, it } from "vitest";
import {
  BUDGET_TONE_THRESHOLD,
  budgetPercentUsed,
  budgetTone,
  countBudgetAlerts,
  totalLimitCents,
} from "@/lib/finance/budget";

describe("budgetPercentUsed", () => {
  it("calcula o percentual usado do limite", () => {
    expect(budgetPercentUsed(50000, 100000)).toBe(50);
    expect(budgetPercentUsed(0, 100000)).toBe(0);
    expect(budgetPercentUsed(100000, 100000)).toBe(100);
    expect(budgetPercentUsed(150000, 100000)).toBe(150);
  });

  it("arredonda para uma casa decimal", () => {
    expect(budgetPercentUsed(1000, 3000)).toBe(33.3);
  });

  it("sem limite devolve null (categoria sem orçamento)", () => {
    expect(budgetPercentUsed(50000, null)).toBeNull();
  });

  it("limite zero evita divisão por zero", () => {
    expect(budgetPercentUsed(50000, 0)).toBeNull();
    expect(budgetPercentUsed(0, 0)).toBeNull();
  });
});

describe("budgetTone", () => {
  it("verde abaixo de 80%", () => {
    expect(budgetTone(0)).toBe("ok");
    expect(budgetTone(79.9)).toBe("ok");
  });

  it("amarelo de 80% a 99,9%", () => {
    expect(budgetTone(BUDGET_TONE_THRESHOLD)).toBe("atencao");
    expect(budgetTone(99.9)).toBe("atencao");
  });

  it("vermelho a partir de 100%", () => {
    expect(budgetTone(100)).toBe("estouro");
    expect(budgetTone(150)).toBe("estouro");
  });

  it("sem percentual não há cor", () => {
    expect(budgetTone(null)).toBeNull();
  });
});

describe("countBudgetAlerts", () => {
  it("conta categorias que cruzaram 80%", () => {
    expect(countBudgetAlerts([79.9, 80, 100, null, 99])).toBe(3);
  });

  it("lista vazia é zero", () => {
    expect(countBudgetAlerts([])).toBe(0);
  });
});

describe("totalLimitCents", () => {
  it("soma apenas limites definidos", () => {
    expect(totalLimitCents([100000, null, 200000])).toBe(300000);
    expect(totalLimitCents([null, null])).toBe(0);
  });
});
