import { z } from "zod";
import { parseBrlToCents } from "@/lib/finance/money";
import { todayKey } from "@/lib/finance/dates";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" });

/** Formulário de meta (criar/editar) — valor digitado com máscara BRL. */
export const goalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Informe ao menos 2 caracteres" })
    .max(60, { message: "Nome muito longo" }),
  target: z
    .string()
    .refine((value) => parseBrlToCents(value) > 0, {
      message: "Informe um valor maior que zero",
    }),
  deadline: dateSchema.nullish().refine(
    (value) => !value || value >= todayKey(),
    { message: "O prazo não pode estar no passado", path: ["deadline"] },
  ),
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;

/** Payload aceito pela action de criar/editar meta. */
export const goalInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Informe ao menos 2 caracteres" })
    .max(60, { message: "Nome muito longo" }),
  targetCents: z
    .number()
    .int({ message: "Valor inválido" })
    .positive({ message: "Informe um valor maior que zero" }),
  deadline: dateSchema.nullish(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;

export const goalStatusSchema = z.enum(["active", "paused", "done"], {
  message: "Status inválido",
});

export type GoalStatus = z.infer<typeof goalStatusSchema>;

/** Aporte: valor com máscara BRL + data. */
export const contributionFormSchema = z.object({
  amount: z
    .string()
    .refine((value) => parseBrlToCents(value) > 0, {
      message: "Informe um valor maior que zero",
    }),
  contributedOn: dateSchema.refine((value) => value <= todayKey(), {
    message: "A data do aporte não pode estar no futuro",
  }),
});

export type ContributionFormValues = z.infer<typeof contributionFormSchema>;

export const contributionInputSchema = z.object({
  goalId: z.uuid({ message: "Meta inválida" }),
  amountCents: z
    .number()
    .int({ message: "Valor inválido" })
    .positive({ message: "Informe um valor maior que zero" }),
  contributedOn: dateSchema,
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;
