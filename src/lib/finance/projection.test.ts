import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  projectedMonthEnd,
  willExceedLimit,
} from "@/lib/finance/projection";

const TODAY = new Date(2026, 9, 10); // 10/10/2026

describe("daysInMonth", () => {
  it("conta os dias do mês (bissexto incluído)", () => {
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
  });
});

describe("projectedMonthEnd", () => {
  it("projeta o mês atual: gasto / dias decorridos * dias do mês", () => {
    // R$ 310,00 em 10 dias -> R$ 961,00 no fim de outubro (31 dias)
    expect(
      projectedMonthEnd({ monthKey: "2026-10", spentCents: 31000, today: TODAY }),
    ).toBe(96100);
  });

  it("mês passado não tem projeção (mês fechado)", () => {
    expect(
      projectedMonthEnd({ monthKey: "2026-09", spentCents: 90000, today: TODAY }),
    ).toBeNull();
  });

  it("mês futuro não tem projeção (sem gasto ainda)", () => {
    expect(
      projectedMonthEnd({ monthKey: "2026-11", spentCents: 0, today: TODAY }),
    ).toBeNull();
  });

  it("gasto zero no mês atual projeta zero", () => {
    expect(
      projectedMonthEnd({ monthKey: "2026-10", spentCents: 0, today: TODAY }),
    ).toBe(0);
  });
});

describe("willExceedLimit", () => {
  it("marca risco quando a projeção passa do limite", () => {
    expect(willExceedLimit(96100, 90000)).toBe(true);
  });

  it("projeção igual ao limite não é risco", () => {
    expect(willExceedLimit(90000, 90000)).toBe(false);
  });

  it("sem projeção ou sem limite não há risco", () => {
    expect(willExceedLimit(null, 90000)).toBe(false);
    expect(willExceedLimit(96100, null)).toBe(false);
  });

  it("limite zero (divisão por zero) não marca risco", () => {
    expect(willExceedLimit(96100, 0)).toBe(false);
  });
});
