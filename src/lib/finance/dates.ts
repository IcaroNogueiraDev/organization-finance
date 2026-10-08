import { addMonths, endOfMonth, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Date -> "yyyy-MM-dd" (sem conversão de fuso: usa a data local). */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Date -> "yyyy-MM". */
export function toMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** "yyyy-MM" -> primeiro dia do mês em "yyyy-MM-dd". */
export function monthKeyToFirstDay(monthKey: string): string {
  return `${monthKey}-01`;
}

/** "yyyy-MM" -> último dia do mês em "yyyy-MM-dd". */
export function monthKeyToLastDay(monthKey: string): string {
  return format(endOfMonth(parseISO(`${monthKey}-01`)), "yyyy-MM-dd");
}

/** "yyyy-MM" +/- n meses -> "yyyy-MM". */
export function addMonthsToKey(monthKey: string, months: number): string {
  return format(addMonths(parseISO(`${monthKey}-01`), months), "yyyy-MM");
}

/** "yyyy-MM" -> "outubro de 2026". */
export function formatMonthLabel(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMMM 'de' yyyy", { locale: ptBR });
}

/** "yyyy-MM" -> "out/26" (eixo dos gráficos). */
export function formatMonthShort(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMM/yy", { locale: ptBR });
}

/** "yyyy-MM-dd" -> "04/10/2026". */
export function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), "dd/MM/yyyy", { locale: ptBR });
}

/** Data local de hoje em "yyyy-MM-dd". */
export function todayKey(): string {
  return toDateKey(new Date());
}
