import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Criar conta · Org Finance",
};

export default function SignupPage() {
  return <SignupForm />;
}
