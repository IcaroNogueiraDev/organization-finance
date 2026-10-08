import type { ModelMessage } from "ai";
import { streamText } from "ai";
import { monthKeyToFirstDay, toMonthKey } from "@/lib/finance/dates";
import { fetchAssistantData, formatAssistantContext } from "@/lib/ai/context";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import {
  createAssistantModel,
  friendlyAiMessage,
  isAiConfigured,
  toFriendlyAiError,
} from "@/lib/ai/provider";
import { assistantMessageSchema } from "@/lib/schemas/assistente";
import { createClient } from "@/lib/supabase/server";

/**
 * Route Handler do assistente (Fase 4 — PLANO.md, arquitetura 1–4):
 * sessão -> validação Zod -> cache da análise mensal -> cota diária ->
 * contexto agregado (sem PII) -> streaming da NVIDIA -> histórico em ai_messages.
 */

/** Histórico de conversa enviado ao modelo (continuidade, sem PII). */
const MODEL_HISTORY_LIMIT = 8;

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

function jsonError(
  message: string,
  status: number,
  extra?: { used?: number; dailyLimit?: number },
): Response {
  return Response.json({ error: message, ...extra }, { status });
}

function textResponse(body: string, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status: 200,
    headers: { ...TEXT_HEADERS, ...extraHeaders },
  });
}

export async function POST(request: Request): Promise<Response> {
  const t0 = performance.now();
  const mark = (label: string) =>
    console.log(`[perf] ${label}: ${Math.round(performance.now() - t0)} ms`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("Sessão expirada. Entre novamente.", 401);
  }
  mark("getUser");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Requisição inválida.", 400);
  }

  const parsed = assistantMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Mensagem inválida.", 400);
  }
  const { message, analysis } = parsed.data;
  mark("parse");

  // 1) Cache da análise mensal: uma resposta por mês, sem gastar cota da IA.
  const analysisMonth = monthKeyToFirstDay(toMonthKey(new Date()));
  if (analysis) {
    const { data: cached, error: cacheError } = await supabase
      .from("ai_messages")
      .select("content")
      .eq("role", "assistant")
      .eq("analysis_month", analysisMonth)
      .maybeSingle();

    if (!cacheError && cached?.content) {
      return textResponse(cached.content, { "X-Assistant-Cache": "hit" });
    }
  }
  mark("cache-check");

  // 2) Provedor configurado? (mensagem amigável antes de consumir a cota)
  if (!isAiConfigured()) {
    return jsonError(friendlyAiMessage("not_configured"), 503);
  }

  // 3) Cota diária por usuário (RPC atômica, tabela sem acesso do cliente).
  const { data: usageData, error: usageError } = await supabase.rpc(
    "consume_ai_message",
  );
  if (usageError) {
    return jsonError("Não foi possível verificar o limite do assistente.", 500);
  }
  const usage = (usageData ?? [])[0];
  if (!usage?.allowed) {
    const dailyLimit = usage?.daily_limit ?? 20;
    return jsonError(
      `Você atingiu o limite de ${dailyLimit} mensagens de hoje. Volte amanhã para continuar conversando com o assistente.`,
      429,
      { used: usage?.used ?? dailyLimit, dailyLimit },
    );
  }
  mark("cota");

  // 4) Resumos agregados (sem nome/e-mail) -> prompt de sistema.
  const dataStart = performance.now();
  const data = await fetchAssistantData(supabase, new Date());
  console.log(
    `[perf] fetchAssistantData: ${Math.round(performance.now() - dataStart)} ms (missing: ${data.missing.join(",") || "nenhuma"})`,
  );
  const contextBlock = formatAssistantContext(data);
  const systemPrompt = buildSystemPrompt(contextBlock);
  mark("contexto");

  const { data: historyRows } = await supabase
    .from("ai_messages")
    .select("role, content")
    .order("created_at", { ascending: false })
    .limit(MODEL_HISTORY_LIMIT);

  const history: ModelMessage[] = (historyRows ?? []).reverse().map((row) => ({
    role: row.role,
    content: row.content,
  }));

  // 5) Persiste a pergunta (se falhar, segue mesmo assim — log no servidor).
  const { error: userInsertError } = await supabase.from("ai_messages").insert({
    user_id: user.id,
    role: "user",
    content: message,
  });
  if (userInsertError) {
    console.error("[assistente] falha ao salvar pergunta:", userInsertError.message);
  }
  mark("histórico+insert");

  const model = createAssistantModel();

  const result = streamText({
    model,
    instructions: systemPrompt,
    messages: [...history, { role: "user", content: message }],
    temperature: 0.4,
    maxOutputTokens: 700,
    // Retry com backoff exponencial para 429/5xx (cota compartilhada).
    maxRetries: 2,
    onError: ({ error }) => {
      console.error("[assistente] provedor:", toFriendlyAiError(error).kind);
    },
    onEnd: async ({ text, finishReason }) => {
      console.log(
        `[perf] onEnd: ${Math.round(performance.now() - t0)} ms (finishReason=${finishReason}, textLen=${text.length})`,
      );
      if (text.trim().length === 0) return;
      const { error } = await supabase.from("ai_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: text,
        analysis_month: analysis ? analysisMonth : null,
      });
      if (error) {
        console.error("[assistente] falha ao salvar resposta:", error.message);
      }
    },
  });

  mark("streamText criado");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = result.textStream.getReader();
      let chunks = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            if (chunks === 0) {
              console.log(
                `[perf] primeiro chunk: ${Math.round(performance.now() - t0)} ms`,
              );
            }
            chunks += 1;
            controller.enqueue(encoder.encode(value));
          }
        }
      } catch (error) {
        // Falha do provedor durante o streaming: mensagem amigável em pt-BR.
        controller.enqueue(encoder.encode(toFriendlyAiError(error).message));
      } finally {
        console.log(
          `[perf] stream concluído: ${Math.round(performance.now() - t0)} ms (chunks=${chunks})`,
        );
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: TEXT_HEADERS });
}
