"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";
import type {
  ContributionInput,
  GoalInput,
  GoalStatus,
} from "@/lib/schemas/goal";
import {
  contributionInputSchema,
  goalInputSchema,
  goalStatusSchema,
} from "@/lib/schemas/goal";

export type GoalProgressItem = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  remainingCents: number;
  percent: number;
  deadline: string | null;
  monthsLeft: number | null;
  status: GoalStatus;
};

export type ContributionListItem = {
  id: string;
  goalId: string;
  amountCents: number;
  contributedOn: string;
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

function isValidId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

function dbError(): string {
  return "Não foi possível concluir. Tente novamente.";
}

/** Verifica se a meta é do usuário logado (RLS + mensagem amigável). */
async function ownedGoal(session: Session, goalId: string): Promise<boolean> {
  const { data } = await session.supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .maybeSingle();
  return Boolean(data);
}

/** Metas com progresso (função SQL goal_progress, recalculada pela trigger). */
export async function getGoalsAction(): Promise<ActionResult<GoalProgressItem[]>> {
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase.rpc("goal_progress");

  if (error) {
    return fail("Não foi possível carregar as metas.");
  }

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      targetCents: Number(row.target_cents),
      savedCents: Number(row.saved_cents),
      remainingCents: Number(row.remaining_cents),
      percent: Number(row.percent),
      deadline: row.deadline,
      monthsLeft: row.months_left === null ? null : Number(row.months_left),
      status: row.status as GoalStatus,
    })),
  );
}

export async function createGoalAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = goalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: GoalInput = parsed.data;
  const { data, error } = await session.supabase
    .from("goals")
    .insert({
      user_id: session.userId,
      name: input.name,
      target_cents: input.targetCents,
      deadline: input.deadline ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(dbError());
  }
  return ok({ id: data.id });
}

export async function updateGoalAction(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!isValidId(id)) {
    return fail("Meta inválida.");
  }
  const parsed = goalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: GoalInput = parsed.data;
  const { data, error } = await session.supabase
    .from("goals")
    .update({
      name: input.name,
      target_cents: input.targetCents,
      deadline: input.deadline ?? null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Meta não encontrada.");
  }
  return ok({ id: data.id });
}

/** Pausar, retomar, concluir ou reabrir uma meta. */
export async function setGoalStatusAction(
  id: string,
  rawStatus: unknown,
): Promise<ActionResult<{ id: string; status: GoalStatus }>> {
  if (!isValidId(id)) {
    return fail("Meta inválida.");
  }
  const parsed = goalStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    return fail("Status inválido.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase
    .from("goals")
    .update({ status: parsed.data })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Meta não encontrada.");
  }
  return ok({ id: data.id, status: parsed.data });
}

export async function deleteGoalAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!isValidId(id)) {
    return fail("Meta inválida.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Meta não encontrada.");
  }
  return ok({ id: data.id });
}

export async function getContributionsAction(
  goalId: string,
): Promise<ActionResult<ContributionListItem[]>> {
  if (!isValidId(goalId)) {
    return fail("Meta inválida.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }
  if (!(await ownedGoal(session, goalId))) {
    return fail("Meta não encontrada.");
  }

  const { data, error } = await session.supabase
    .from("goal_contributions")
    .select("id, goal_id, amount_cents, contributed_on")
    .eq("goal_id", goalId)
    .order("contributed_on", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    return fail(dbError());
  }

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      goalId: row.goal_id,
      amountCents: Number(row.amount_cents),
      contributedOn: row.contributed_on,
    })),
  );
}

export async function createContributionAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = contributionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const input: ContributionInput = parsed.data;
  if (!(await ownedGoal(session, input.goalId))) {
    return fail("Meta não encontrada.");
  }

  const { data, error } = await session.supabase
    .from("goal_contributions")
    .insert({
      user_id: session.userId,
      goal_id: input.goalId,
      amount_cents: input.amountCents,
      contributed_on: input.contributedOn,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(dbError());
  }
  return ok({ id: data.id });
}

export async function deleteContributionAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!isValidId(id)) {
    return fail("Aporte inválido.");
  }
  const session = await getSession();
  if (!session) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await session.supabase
    .from("goal_contributions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return fail("Aporte não encontrado.");
  }
  return ok({ id: data.id });
}
