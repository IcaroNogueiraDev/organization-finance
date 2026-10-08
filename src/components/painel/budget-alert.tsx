"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getBudgetStatusAction } from "@/lib/actions/budgets";
import { countBudgetAlerts } from "@/lib/finance/budget";

type BudgetAlertProps = {
  /** "yyyy-MM" */
  month: string;
};

/** Destaque no painel quando categorias passam de 80% do limite no mês. */
export function BudgetAlert({ month }: BudgetAlertProps) {
  const query = useQuery({
    queryKey: ["budgets", "status", month],
    queryFn: async () => {
      const result = await getBudgetStatusAction(month);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (query.isLoading) {
    return null;
  }
  if (query.isError) {
    return null;
  }

  const rows = query.data ?? [];
  const alertCount = countBudgetAlerts(rows.map((row) => row.percentUsed));
  if (alertCount === 0) {
    return null;
  }

  const overLimit = rows.filter((row) => (row.percentUsed ?? 0) >= 100);
  const alertRows = rows.filter((row) => (row.percentUsed ?? 0) >= 80);

  return (
    <Alert variant={overLimit.length > 0 ? "destructive" : "warning"}>
      <TriangleAlertIcon />
      <AlertTitle>
        Orçamento: {alertCount} categoria(s) em alerta no mês
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{alertRows.map((row) => row.categoryName).join(" · ")}</span>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/orcamentos">Ver orçamento</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
