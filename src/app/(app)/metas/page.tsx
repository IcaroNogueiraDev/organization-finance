import type { Metadata } from "next";
import { MetasView } from "@/components/metas/metas-view";

export const metadata: Metadata = {
  title: "Metas · Org Finance",
};

export default function MetasPage() {
  return <MetasView />;
}
