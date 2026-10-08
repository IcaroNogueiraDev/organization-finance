import type { Metadata } from "next";
import { PainelView } from "@/components/painel/painel-view";

export const metadata: Metadata = {
  title: "Painel · Org Finance",
};

export default function PainelPage() {
  return <PainelView />;
}
