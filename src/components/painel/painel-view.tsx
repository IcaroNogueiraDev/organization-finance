"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChartIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { MonthPicker } from "@/components/month-picker";
import {
  BalanceLineChart,
  ExpensesPieChart,
  IncomeExpenseBarChart,
} from "@/components/painel/charts";
import { SummaryCards } from "@/components/painel/summary-cards";
import { BudgetAlert } from "@/components/painel/budget-alert";
import {
  getExpensesByCategoryAction,
  getMonthlySeriesAction,
  getMonthlySummaryAction,
} from "@/lib/actions/dashboard";
import { formatMonthLabel, toMonthKey } from "@/lib/finance/dates";

export function PainelView() {
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [range, setRange] = useState<6 | 12>(6);

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary", month],
    queryFn: async () => {
      const result = await getMonthlySummaryAction(month);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const seriesQuery = useQuery({
    queryKey: ["dashboard", "series", range],
    queryFn: async () => {
      const result = await getMonthlySeriesAction(range);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const expensesQuery = useQuery({
    queryKey: ["dashboard", "expenses", month],
    queryFn: async () => {
      const result = await getExpensesByCategoryAction(month);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const series = seriesQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const hasExpenses = expenses.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">
            Resumo de {formatMonthLabel(month)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <Select
            value={String(range)}
            onValueChange={(value) => setRange(Number(value) === 12 ? 12 : 6)}
          >
            <SelectTrigger className="w-36" aria-label="Período dos gráficos">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <SummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        onRetry={() => void summaryQuery.refetch()}
      />

      <BudgetAlert month={month} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receitas vs. despesas</CardTitle>
            <CardDescription>Últimos {range} meses</CardDescription>
          </CardHeader>
          <CardContent>
            {seriesQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : seriesQuery.isError ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">
                  {seriesQuery.error instanceof Error
                    ? seriesQuery.error.message
                    : "Não foi possível carregar o histórico."}
                </p>
                <button
                  type="button"
                  onClick={() => void seriesQuery.refetch()}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <IncomeExpenseBarChart data={series} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
            <CardDescription>{formatMonthLabel(month)}</CardDescription>
          </CardHeader>
          <CardContent>
            {expensesQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : expensesQuery.isError ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">
                  {expensesQuery.error instanceof Error
                    ? expensesQuery.error.message
                    : "Não foi possível carregar as despesas."}
                </p>
                <button
                  type="button"
                  onClick={() => void expensesQuery.refetch()}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Tentar novamente
                </button>
              </div>
            ) : hasExpenses ? (
              <ExpensesPieChart data={expenses} />
            ) : (
              <div className="flex h-72 items-center justify-center">
                <EmptyState
                  icon={PieChartIcon}
                  title="Sem despesas no mês"
                  description="Quando você registrar despesas, a divisão por categoria aparece aqui."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo ao longo do tempo</CardTitle>
          <CardDescription>
            Receitas menos despesas nos últimos {range} meses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seriesQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : seriesQuery.isError ? (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive">
                {seriesQuery.error instanceof Error
                  ? seriesQuery.error.message
                  : "Não foi possível carregar o saldo."}
              </p>
              <button
                type="button"
                onClick={() => void seriesQuery.refetch()}
                className="text-sm font-medium underline underline-offset-4"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <BalanceLineChart data={series} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
