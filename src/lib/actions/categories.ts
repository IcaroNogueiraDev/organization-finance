"use server";

import { createClient } from "@/lib/supabase/server";
import type { CategoryKind, TransactionType } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";
import { categoryFormSchema } from "@/lib/schemas/category";

export type CategoryListItem = {
  id: string;
  name: string;
  type: TransactionType;
  kind: CategoryKind | null;
  color: string | null;
};

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  return { supabase, userId: user.id };
}

function isValidId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export async function getCategoriesAction(): Promise<
  ActionResult<CategoryListItem[]>
> {
  const session = await requireSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase
    .from("categories")
    .select("id, name, type, kind, color")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return fail("Não foi possível carregar as categorias.");
  }
  return ok((data ?? []) as CategoryListItem[]);
}

export async function createCategoryAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = categoryFormSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await requireSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }
  const input = parsed.data;

  const { data, error } = await session.supabase
    .from("categories")
    .insert({
      user_id: session.userId,
      name: input.name,
      type: input.type,
      kind: input.type === "income" ? null : (input.kind ?? null),
      color: input.color ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("Você já tem uma categoria com esse nome.");
    }
    return fail("Não foi possível criar a categoria.");
  }
  return ok({ id: data.id });
}

export async function updateCategoryAction(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!isValidId(id)) {
    return fail("Categoria inválida.");
  }
  const parsed = categoryFormSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await requireSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }
  const input = parsed.data;

  const { data, error } = await session.supabase
    .from("categories")
    .update({
      name: input.name,
      type: input.type,
      kind: input.type === "income" ? null : (input.kind ?? null),
      color: input.color ?? null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return fail("Você já tem uma categoria com esse nome.");
    }
    return fail("Categoria não encontrada.");
  }
  return ok({ id: data.id });
}

export async function deleteCategoryAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!isValidId(id)) {
    return fail("Categoria inválida.");
  }
  const session = await requireSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { count } = await session.supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if ((count ?? 0) > 0) {
    return fail(
      `Categoria em uso por ${count} transação(ões). Mude a categoria delas antes de excluir.`,
    );
  }

  const { data, error } = await session.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Categoria não encontrada.");
  }
  return ok({ id: data.id });
}
