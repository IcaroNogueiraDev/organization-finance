"use client";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlySummary } from "@/lib/actions/dashboard";
import { centsToBrl } from "@/lib/finance/money";

type SummaryCardsProps = {
  summary: MonthlySummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

export function SummaryCards({
  summary,
  isLoading,
  isError,
  onRetry,
}: SummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-2 py-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
        <p className="text-sm text-destructive">
          Não foi possível carregar o resumo do mês. Confira se a migration da
          Fase 2 foi aplicada.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const balance = summary?.balanceCents ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-1 py-6">
          <CardDescription>Receitas</CardDescription>
          <CardTitle className="text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">
            {centsToBrl(summary?.totalIncomeCents ?? 0)}
          </CardTitle>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1 py-6">
          <CardDescription>Despesas</CardDescription>
          <CardTitle className="text-2xl tabular-nums text-red-600 dark:text-red-400">
            {centsToBrl(summary?.totalExpenseCents ?? 0)}
          </CardTitle>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1 py-6">
          <CardDescription>Saldo</CardDescription>
          <CardTitle
            className={`text-2xl tabular-nums ${
              balance >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {centsToBrl(balance)}
          </CardTitle>
        </CardContent>
      </Card>
    </div>
  );
}
