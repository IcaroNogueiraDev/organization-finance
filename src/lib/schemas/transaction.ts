import { z } from "zod";
import { parseBrlToCents } from "@/lib/finance/money";

export const TRANSACTION_PAGE_SIZE = 20;

export const transactionFormSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z
    .string()
    .refine((value) => parseBrlToCents(value) > 0, {
      message: "Informe um valor maior que zero",
    }),
  description: z.string().trim().max(120, "Descrição muito longa"),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" }),
  isRecurring: z.boolean(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const transactionInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  amountCents: z
    .number()
    .int({ message: "Valor inválido" })
    .positive({ message: "Informe um valor maior que zero" }),
  description: z.string().trim().max(120, "Descrição muito longa"),
  categoryId: z.uuid({ message: "Selecione uma categoria" }),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" }),
  isRecurring: z.boolean(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionFiltersSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, { message: "Mês inválido" }),
  type: z.enum(["all", "income", "expense"]),
  categoryId: z.string().uuid().nullish(),
  kind: z
    .enum(["fixed", "variable", "essential", "non_essential"])
    .nullish(),
  search: z.string().trim().max(80).nullish(),
  sort: z.enum(["occurred_on", "amount_cents"]),
  dir: z.enum(["asc", "desc"]),
  page: z.number().int().min(1),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

export const bulkCategorySchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos uma transação"),
  categoryId: z.uuid({ message: "Selecione uma categoria" }),
});

export type BulkCategoryInput = z.infer<typeof bulkCategorySchema>;
