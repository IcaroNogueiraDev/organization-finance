"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/schemas/auth";

export type AuthFormState = {
  error?: string;
  success?: string;
} | null;

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (lower.includes("already registered")) {
    return "Já existe uma conta com este e-mail.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Muitas tentativas. Aguarde um instante e tente novamente.";
  }
  if (lower.includes("password should be")) {
    return "A senha não atende aos requisitos do Supabase.";
  }
  return "Não foi possível concluir. Tente novamente.";
}

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  return headerList.get("origin") ?? "http://localhost:3000";
}

export async function loginAction(
  _prevState: AuthFormState,
  payload: LoginInput,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

export async function signupAction(
  _prevState: AuthFormState,
  payload: SignupInput,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  // Sem sessão = confirmação de e-mail pendente (padrão do Supabase)
  if (!data.session) {
    return {
      success:
        "Cadastro realizado! Enviamos um link de confirmação para o seu e-mail.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
