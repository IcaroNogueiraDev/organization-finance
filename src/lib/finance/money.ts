const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Converte uma string digitada ("R$ 1.234,56", "12,34") para centavos. */
export function parseBrlToCents(input: string): number {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) {
    return 0;
  }
  return Number.parseInt(digits, 10);
}

/** Centavos -> "R$ 1.234,56" (sinal antes do R$ quando negativo). */
export function centsToBrl(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}R$ ${numberFormatter.format(Math.abs(cents) / 100)}`;
}

/** Centavos -> versão curta para eixos de gráfico ("R$ 1,2 mil"). */
export function centsToBrlCompact(cents: number): string {
  const reais = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (reais >= 1_000_000) {
    return `${sign}R$ ${(reais / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  }
  if (reais >= 1_000) {
    return `${sign}R$ ${(reais / 1_000).toFixed(1).replace(".", ",")} mil`;
  }
  return centsToBrl(cents);
}

/** Centavos -> "1.234,56" (sem o símbolo, para exibir em Inputs). */
export function centsToPlain(cents: number): string {
  return numberFormatter.format(Math.abs(cents) / 100);
}

/**
 * Máscara BRL: recebe apenas dígitos e devolve o texto formatado
 * preenchendo os centavos da direita para a esquerda ("1234" -> "R$ 12,34").
 */
export function formatCentsInput(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (clean.length === 0) {
    return "";
  }
  return `R$ ${numberFormatter.format(Number.parseInt(clean, 10) / 100)}`;
}

/** Extrai os dígitos de um valor já formatado (para a máscara). */
export function digitsOf(formatted: string): string {
  return formatted.replace(/\D/g, "");
}
