import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .email({ message: "Informe um e-mail válido" })
    .transform((value) => value.toLowerCase()),
  password: z.string().min(6, "A senha precisa de pelo menos 6 caracteres"),
});

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome")
    .max(80, "Nome muito longo"),
  email: z
    .email({ message: "Informe um e-mail válido" })
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
