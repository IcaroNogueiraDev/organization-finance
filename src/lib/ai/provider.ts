import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { APICallError, LoadAPIKeyError } from "ai";

/**
 * Camada isolada do provedor de IA (Fase 4 — PLANO.md):
 * "se a NVIDIA mudar limites ou modelos, troca-se só esse arquivo".
 *
 * A chave (`NVIDIA_API_KEY`) só é lida aqui, dentro do servidor — nunca vai
 * para o client (regra 6 das instruções do projeto).
 */

/** Endpoint OpenAI-compatível da NVIDIA (NIM). */
export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Modelo padrão enquanto `NVIDIA_MODEL` não estiver definido. */
export const NVIDIA_DEFAULT_MODEL = "meta/llama-3.1-70b-instruct";

export type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "unauthorized"
  | "network"
  | "timeout"
  | "unknown";

/** Erro de negócio do assistente: `kind` + mensagem pronta em pt-BR. */
export class AiProviderError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

/** NVIDIA configurada nesta instância? (chave presente no servidor) */
export function isAiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}

/** Modelo ativo: `NVIDIA_MODEL` sem efeito colateral no código. */
export function getAssistantModelId(): string {
  return process.env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL;
}

/**
 * Modelo de chat da NVIDIA via adaptador OpenAI-compatível.
 * Lança `AiProviderError("not_configured")` quando falta a chave.
 */
export function createAssistantModel(): LanguageModel {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new AiProviderError(
      "not_configured",
      "O assistente de IA ainda não foi configurado neste servidor.",
    );
  }

  const provider = createOpenAICompatible<string, string, string, string>({
    name: "nvidia",
    baseURL: process.env.NVIDIA_BASE_URL?.trim() || NVIDIA_DEFAULT_BASE_URL,
    apiKey,
  });

  return provider.languageModel(getAssistantModelId());
}

/** Classifica o erro do provedor para escolher a mensagem amigável. */
export function classifyAiError(error: unknown): AiErrorKind {
  if (error instanceof AiProviderError) return error.kind;

  if (error instanceof LoadAPIKeyError) return "not_configured";

  if (error instanceof APICallError) {
    if (error.statusCode === 429 || /rate.?limit|quota/i.test(error.message)) {
      return "rate_limited";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "unauthorized";
    }
    if (/timeout|timed out/i.test(error.message)) return "timeout";
    return "unknown";
  }

  if (error instanceof Error) {
    if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(error.message)) {
      return "network";
    }
    if (/timeout|timed out/i.test(error.message)) return "timeout";
  }

  return "unknown";
}

const FRIENDLY_MESSAGES: Record<AiErrorKind, string> = {
  not_configured:
    "O assistente de IA ainda não está disponível: falta configurar a chave da NVIDIA no servidor.",
  rate_limited:
    "O limite de uso da IA foi atingido agora. Aguarde alguns minutos e tente de novo.",
  unauthorized:
    "A IA não autorizou o uso da chave do servidor. Revise a configuração de `NVIDIA_API_KEY`.",
  network: "Não consegui me conectar à IA. Verifique sua conexão e tente de novo.",
  timeout: "A IA demorou para responder. Tente novamente em instantes.",
  unknown: "Não consegui gerar a resposta agora. Tente novamente em instantes.",
};

/** Mensagem pronta em pt-BR para o usuário final. */
export function friendlyAiMessage(kind: AiErrorKind): string {
  return FRIENDLY_MESSAGES[kind];
}

/** Erro do provedor -> `AiProviderError` com mensagem amigável. */
export function toFriendlyAiError(error: unknown): AiProviderError {
  const kind = classifyAiError(error);
  return new AiProviderError(kind, friendlyAiMessage(kind));
}
