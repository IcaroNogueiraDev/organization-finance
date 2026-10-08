import { describe, expect, it } from "vitest";
import {
  centsToBrl,
  centsToPlain,
  digitsOf,
  formatCentsInput,
  parseBrlToCents,
} from "@/lib/finance/money";

describe("parseBrlToCents", () => {
  it("converte valor formatado para centavos", () => {
    expect(parseBrlToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBrlToCents("12,34")).toBe(1234);
    expect(parseBrlToCents("0,50")).toBe(50);
  });

  it("trata entradas vazias e inválidas", () => {
    expect(parseBrlToCents("")).toBe(0);
    expect(parseBrlToCents("R$ ")).toBe(0);
    expect(parseBrlToCents("abc")).toBe(0);
  });

  it("ignora o separador de milhar", () => {
    expect(parseBrlToCents("1.234.567,89")).toBe(123456789);
  });
});

describe("centsToBrl", () => {
  it("formata centavos como moeda BRL", () => {
    expect(centsToBrl(123456)).toBe("R$ 1.234,56");
    expect(centsToBrl(0)).toBe("R$ 0,00");
    expect(centsToBrl(50)).toBe("R$ 0,50");
  });

  it("coloca o sinal antes do R$", () => {
    expect(centsToBrl(-500)).toBe("-R$ 5,00");
    expect(centsToBrl(-123456)).toBe("-R$ 1.234,56");
  });

  it("é inversível com parseBrlToCents", () => {
    expect(parseBrlToCents(centsToBrl(98765))).toBe(98765);
    expect(parseBrlToCents(centsToBrl(100))).toBe(100);
  });
});

describe("centsToPlain", () => {
  it("formata sem o símbolo da moeda", () => {
    expect(centsToPlain(123456)).toBe("1.234,56");
    expect(centsToPlain(5)).toBe("0,05");
  });
});

describe("formatCentsInput (máscara)", () => {
  it("preenche os centavos da direita para a esquerda", () => {
    expect(formatCentsInput("")).toBe("");
    expect(formatCentsInput("1")).toBe("R$ 0,01");
    expect(formatCentsInput("1234")).toBe("R$ 12,34");
    expect(formatCentsInput("123456")).toBe("R$ 1.234,56");
  });

  it("descarta caracteres não numéricos", () => {
    expect(formatCentsInput("12a34")).toBe("R$ 12,34");
  });

  it("round-trip com digitsOf", () => {
    const digits = digitsOf("R$ 1.234,56");
    expect(digits).toBe("123456");
    expect(parseBrlToCents(formatCentsInput(digits))).toBe(123456);
  });
});
