import type { Metadata } from "next";
import { AssistenteView } from "@/components/assistente/assistente-view";

export const metadata: Metadata = {
  title: "Assistente · Org Finance",
};

export default function AssistentePage() {
  return <AssistenteView />;
}
