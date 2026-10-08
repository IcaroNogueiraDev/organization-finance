"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";
import { monthKeyToFirstDay } from "@/lib/finance/dates";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, { message: "Mês inválido" });

const monthsSchema = z
  .number()
  .int()
  .min(1, { message: "Período inválido" })
  .max(24, { message: "Período inválido" });

export type MonthlySummary = {
  totalIncomeCents: number;
  totalExpenseCents: number;
  balanceCents: number;
};

export type SeriesPoint = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};

export type ExpenseByCategory = {
  categoryId: string | null;
  categoryName: string;
  color: string | null;
  kind: string | null;
  totalCents: number;
  percent: number;
};

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  return supabase;
}

export async function getMonthlySummaryAction(
  month: string,
): Promise<ActionResult<MonthlySummary>> {
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return fail("Mês inválido.");
  }
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await supabase.rpc("monthly_summary", {
    p_month: monthKeyToFirstDay(parsed.data),
  });

  if (error) {
    return fail("Não foi possível carregar o resumo do mês.");
  }

  const row = (data ?? [])[0];
  return ok({
    totalIncomeCents: row?.total_income_cents ?? 0,
    totalExpenseCents: row?.total_expense_cents ?? 0,
    balanceCents: row?.balance_cents ?? 0,
  });
}

export async function getMonthlySeriesAction(
  months: number,
): Promise<ActionResult<SeriesPoint[]>> {
  const parsed = monthsSchema.safeParse(months);
  if (!parsed.success) {
    return fail("Período inválido.");
  }
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await supabase.rpc("monthly_series", {
    p_months: parsed.data,
  });

  if (error) {
    return fail("Não foi possível carregar o histórico mensal.");
  }

  return ok(
    (data ?? []).map((row) => ({
      month: row.month.slice(0, 7),
      incomeCents: row.income_cents,
      expenseCents: row.expense_cents,
      balanceCents: row.balance_cents,
    })),
  );
}

export async function getExpensesByCategoryAction(
  month: string,
): Promise<ActionResult<ExpenseByCategory[]>> {
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return fail("Mês inválido.");
  }
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await supabase.rpc("expenses_by_category", {
    p_month: monthKeyToFirstDay(parsed.data),
  });

  if (error) {
    return fail("Não foi possível carregar as despesas por categoria.");
  }

  return ok(
    (data ?? []).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      color: row.color,
      kind: row.kind,
      totalCents: row.total_cents,
      percent: Number(row.percent),
    })),
  );
}
