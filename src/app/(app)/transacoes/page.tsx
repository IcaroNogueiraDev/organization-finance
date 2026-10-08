import type { Metadata } from "next";
import { TransactionsView } from "@/components/transactions/transactions-view";

export const metadata: Metadata = {
  title: "Transações · Org Finance",
};

export default function TransacoesPage() {
  return <TransactionsView />;
}
