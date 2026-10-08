"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/types";
import { fail, ok } from "@/lib/actions/types";

/** Quantidade de mensagens carregadas ao abrir o chat. */
const HISTORY_LIMIT = 40;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiUsage = {
  used: number;
  dailyLimit: number;
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

/** Histórico recente da conversa (RLS: só as próprias mensagens). */
export async function getChatHistoryAction(): Promise<ActionResult<ChatMessage[]>> {
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    return fail("Não foi possível carregar a conversa.");
  }

  return ok(
    (data ?? [])
      .map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      }))
      .reverse(),
  );
}

/** Consumo da cota do dia via RPC `ai_usage` (não consome mensagem). */
export async function getAiUsageAction(): Promise<ActionResult<AiUsage>> {
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { data, error } = await supabase.rpc("ai_usage");
  if (error) {
    return fail("Não foi possível consultar o limite do assistente.");
  }

  const row = (data ?? [])[0];
  return ok({
    used: row?.used ?? 0,
    dailyLimit: row?.daily_limit ?? 20,
  });
}

/** Apaga todo o histórico da conversa do usuário logado. */
export async function clearChatHistoryAction(): Promise<ActionResult<true>> {
  const supabase = await requireSession();
  if (!supabase) {
    return fail("Sessão expirada. Entre novamente.");
  }

  const { error } = await supabase
    .from("ai_messages")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00Z");

  if (error) {
    return fail("Não foi possível apagar a conversa.");
  }

  return ok(true);
}
