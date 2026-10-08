import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 2000;

/** Mensagem enviada ao assistente (`POST /api/assistant`). */
export const assistantMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { message: "Escreva uma mensagem." })
    .max(MAX_MESSAGE_LENGTH, {
      message: `Mensagem muito longa (máximo de ${MAX_MESSAGE_LENGTH} caracteres).`,
    }),
  /** true quando o pedido é a "análise do mês" (usa cache mensal). */
  analysis: z.boolean().optional().default(false),
});

export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>;
