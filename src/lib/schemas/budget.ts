import { z } from "zod";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, { message: "Mês inválido" });

export const budgetLimitSchema = z.object({
  categoryId: z.uuid({ message: "Categoria inválida" }),
  month: monthKeySchema,
  limitCents: z
    .number()
    .int({ message: "Limite inválido" })
    .positive({ message: "Informe um limite maior que zero" }),
});

export type BudgetLimitInput = z.infer<typeof budgetLimitSchema>;

export const clearBudgetLimitSchema = z.object({
  categoryId: z.uuid({ message: "Categoria inválida" }),
  month: monthKeySchema,
});

export type ClearBudgetLimitInput = z.infer<typeof clearBudgetLimitSchema>;

export const copyBudgetSchema = z
  .object({
    from: monthKeySchema,
    to: monthKeySchema,
  })
  .refine((value) => value.from !== value.to, {
    message: "Escolha meses diferentes",
  });

export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>;
