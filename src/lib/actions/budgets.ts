"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";
import type {
  BudgetLimitInput,
  ClearBudgetLimitInput,
  CopyBudgetInput,
} from "@/lib/schemas/budget";
import {
  budgetLimitSchema,
  clearBudgetLimitSchema,
  copyBudgetSchema,
} from "@/lib/schemas/budget";
import { monthKeyToFirstDay, monthKeyToLastDay } from "@/lib/finance/dates";

export type BudgetRow = {
  categoryId: string;
  categoryName: string;
  color: string | null;
  limitCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  percentUsed: number | null;
};

type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

const monthKeyPattern = /^\d{4}-\d{2}$/;

async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }
  return { supabase, userId: user.id };
}

function dbError(): string {
  return "Não foi possível concluir. Tente novamente.";
}

async function categoryBelongsToUser(
  session: Session,
  categoryId: string,
  expectedType: "income" | "expense",
): Promise<boolean> {
  const { data } = await session.supabase
    .from("categories")
    .select("id, type")
    .eq("id", categoryId)
    .maybeSingle();

  return Boolean(data && data.type === expectedType);
}

/** Limite vs gasto por categoria no mês (função SQL budget_status). */
export async function getBudgetStatusAction(
  month: string,
): Promise<ActionResult<BudgetRow[]>> {
  if (!monthKeyPattern.test(month)) {
    return fail("Mês inválido.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase.rpc("budget_status", {
    p_month: monthKeyToFirstDay(month),
  });

  if (error) {
    return fail("Não foi possível carregar o orçamento do mês.");
  }

  return ok(
    (data ?? []).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      color: row.color,
      limitCents: row.limit_cents === null ? null : Number(row.limit_cents),
      spentCents: Number(row.spent_cents),
      remainingCents: row.remaining_cents === null ? null : Number(row.remaining_cents),
      percentUsed: row.percent_used === null ? null : Number(row.percent_used),
    })),
  );
}

/** Cria ou atualiza o limite de uma categoria no mês (upsert). */
export async function setBudgetLimitAction(
  rawInput: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  const parsed = budgetLimitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: BudgetLimitInput = parsed.data;
  if (!(await categoryBelongsToUser(session, input.categoryId, "expense"))) {
    return fail("Categoria inválida.");
  }

  const { error } = await session.supabase.from("budgets").upsert(
    {
      user_id: session.userId,
      category_id: input.categoryId,
      month: monthKeyToFirstDay(input.month),
      limit_cents: input.limitCents,
    },
    { onConflict: "user_id,category_id,month" },
  );

  if (error) {
    return fail(dbError());
  }
  return ok({ categoryId: input.categoryId });
}

/** Volta a categoria para "sem limite" no mês. */
export async function clearBudgetLimitAction(
  rawInput: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  const parsed = clearBudgetLimitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: ClearBudgetLimitInput = parsed.data;
  const { error } = await session.supabase
    .from("budgets")
    .delete()
    .eq("category_id", input.categoryId)
    .gte("month", monthKeyToFirstDay(input.month))
    .lte("month", monthKeyToLastDay(input.month));

  if (error) {
    return fail(dbError());
  }
  return ok({ categoryId: input.categoryId });
}

/** Copia os limites de um mês para outro sem sobrescrever os existentes. */
export async function copyBudgetAction(
  rawInput: unknown,
): Promise<ActionResult<{ copied: number }>> {
  const parsed = copyBudgetSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: CopyBudgetInput = parsed.data;
  const { data, error } = await session.supabase.rpc("copy_budget", {
    p_from: monthKeyToFirstDay(input.from),
    p_to: monthKeyToFirstDay(input.to),
  });

  if (error) {
    return fail("Não foi possível copiar o orçamento.");
  }

  return ok({ copied: Number(data ?? 0) });
}
