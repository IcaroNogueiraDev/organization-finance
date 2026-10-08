import { z } from "zod";

export const categoryFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: "Informe ao menos 2 caracteres" })
      .max(40, { message: "Nome muito longo" }),
    type: z.enum(["income", "expense"]),
    kind: z
      .enum(["fixed", "variable", "essential", "non_essential"])
      .nullish(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, { message: "Cor inválida" })
      .nullish(),
  })
  .refine((value) => value.type === "income" || value.kind != null, {
    message: "Classifique a despesa (fixa, variável, essencial ou não essencial)",
    path: ["kind"],
  });

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
