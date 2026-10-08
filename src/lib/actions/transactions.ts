"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  CategoryKind,
  TransactionType,
} from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";
import type { TransactionFilters } from "@/lib/schemas/transaction";
import {
  TRANSACTION_PAGE_SIZE,
  bulkCategorySchema,
  transactionFiltersSchema,
  transactionInputSchema,
} from "@/lib/schemas/transaction";
import { monthKeyToFirstDay, monthKeyToLastDay } from "@/lib/finance/dates";

export type TransactionListItem = {
  id: string;
  type: TransactionType;
  amount_cents: number;
  description: string | null;
  occurred_on: string;
  is_recurring: boolean;
  categories: {
    id: string;
    name: string;
    kind: CategoryKind | null;
    color: string | null;
  } | null;
};

type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function dbError(): string {
  return "Não foi possível concluir. Tente novamente.";
}

export async function getTransactionsAction(
  rawFilters: TransactionFilters,
): Promise<ActionResult<{ rows: TransactionListItem[]; total: number }>> {
  const parsed = transactionFiltersSchema.safeParse(rawFilters);
  if (!parsed.success) {
    return fail("Filtros inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }
  const filters = parsed.data;

  const withKind = Boolean(filters.kind);
  const select = [
    "id",
    "type",
    "amount_cents",
    "description",
    "occurred_on",
    "is_recurring",
    "category_id",
    `category:categories${withKind ? "!inner" : ""}(id, name, kind, color)`,
  ].join(", ");

  let query = session.supabase
    .from("transactions")
    .select(select, { count: "exact" })
    .gte("occurred_on", monthKeyToFirstDay(filters.month))
    .lte("occurred_on", monthKeyToLastDay(filters.month));

  if (filters.type !== "all") {
    query = query.eq("type", filters.type);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.kind) {
    query = query.eq("category.kind", filters.kind);
  }
  if (filters.search) {
    query = query.ilike("description", `%${escapeLike(filters.search)}%`);
  }

  const from = (filters.page - 1) * TRANSACTION_PAGE_SIZE;
  const { data, error, count } = await query
    .order(filters.sort, { ascending: filters.dir === "asc" })
    .order("id", { ascending: true })
    .range(from, from + TRANSACTION_PAGE_SIZE - 1);

  if (error) {
    return fail(dbError());
  }

  return ok({
    rows: (data ?? []) as unknown as TransactionListItem[],
    total: count ?? 0,
  });
}

async function getCategory(
  session: Session,
  categoryId: string,
): Promise<{ type: TransactionType } | null> {
  const { data } = await session.supabase
    .from("categories")
    .select("id, type")
    .eq("id", categoryId)
    .maybeSingle();
  return data;
}

export async function createTransactionAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = transactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input = parsed.data;
  const category = await getCategory(session, input.categoryId);
  if (!category) {
    return fail("Categoria inválida.");
  }
  if (category.type !== input.type) {
    return fail(
      `A categoria escolhida é de ${
        category.type === "income" ? "receita" : "despesa"
      }.`,
    );
  }

  const { data, error } = await session.supabase
    .from("transactions")
    .insert({
      user_id: session.userId,
      category_id: input.categoryId,
      type: input.type,
      amount_cents: input.amountCents,
      description: input.description || null,
      occurred_on: input.occurredOn,
      is_recurring: input.isRecurring,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(dbError());
  }
  return ok({ id: data.id });
}

export async function updateTransactionAction(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail("Transação inválida.");
  }
  const parsed = transactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input = parsed.data;
  const category = await getCategory(session, input.categoryId);
  if (!category) {
    return fail("Categoria inválida.");
  }
  if (category.type !== input.type) {
    return fail(
      `A categoria escolhida é de ${
        category.type === "income" ? "receita" : "despesa"
      }.`,
    );
  }

  const { data, error } = await session.supabase
    .from("transactions")
    .update({
      category_id: input.categoryId,
      type: input.type,
      amount_cents: input.amountCents,
      description: input.description || null,
      occurred_on: input.occurredOn,
      is_recurring: input.isRecurring,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Transação não encontrada.");
  }
  return ok({ id: data.id });
}

export async function deleteTransactionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail("Transação inválida.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Transação não encontrada.");
  }
  return ok({ id: data.id });
}

export async function bulkSetCategoryAction(
  rawInput: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const parsed = bulkCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }
  const { ids, categoryId } = parsed.data;

  const { data: category } = await session.supabase
    .from("categories")
    .select("id, type")
    .eq("id", categoryId)
    .maybeSingle();

  if (!category) {
    return fail("Categoria inválida.");
  }

  const { data: rows, error } = await session.supabase
    .from("transactions")
    .select("id, type")
    .in("id", ids);

  if (error) {
    return fail(dbError());
  }

  const selected = rows ?? [];
  if (selected.length === 0) {
    return fail("Transações não encontradas.");
  }
  if (selected.some((row) => row.type !== category.type)) {
    return fail(
      `A categoria escolhida é de ${
        category.type === "income" ? "receita" : "despesa"
      }: selecione apenas transações do mesmo tipo.`,
    );
  }

  const { data: updated, error: updateError } = await session.supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .in("id", ids)
    .select("id");

  if (updateError) {
    return fail(dbError());
  }

  return ok({ updated: (updated ?? []).length });
}
