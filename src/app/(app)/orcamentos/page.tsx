import type { Metadata } from "next";
import { OrcamentosView } from "@/components/orcamentos/orcamentos-view";

export const metadata: Metadata = {
  title: "Orçamentos · Org Finance",
};

export default function OrcamentosPage() {
  return <OrcamentosView />;
}
