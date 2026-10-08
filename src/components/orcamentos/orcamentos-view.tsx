"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  Loader2Icon,
  PieChartIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { MonthNav } from "@/components/month-nav";
import { getCategoriesAction } from "@/lib/actions/categories";
import {
  clearBudgetLimitAction,
  copyBudgetAction,
  getBudgetStatusAction,
  setBudgetLimitAction,
  type BudgetRow,
} from "@/lib/actions/budgets";
import { getMonthlySummaryAction } from "@/lib/actions/dashboard";
import { addMonthsToKey, toMonthKey } from "@/lib/finance/dates";
import {
  budgetTone,
  countBudgetAlerts,
  totalLimitCents,
} from "@/lib/finance/budget";
import {
  centsToBrl,
  centsToBrlCompact,
  digitsOf,
  formatCentsInput,
  parseBrlToCents,
} from "@/lib/finance/money";
import { projectedMonthEnd, willExceedLimit } from "@/lib/finance/projection";

const TONE_BAR: Record<string, string> = {
  ok: "bg-emerald-500",
  atencao: "bg-amber-500",
  estouro: "bg-red-500",
};

const TONE_TEXT: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  atencao: "text-amber-600 dark:text-amber-400",
  estouro: "text-red-600 dark:text-red-400",
};

function sortRows(rows: BudgetRow[]): BudgetRow[] {
  return [...rows].sort((a, b) => {
    const pa = a.percentUsed ?? -1;
    const pb = b.percentUsed ?? -1;
    if (pb !== pa) return pb - pa;
    if (b.spentCents !== a.spentCents) return b.spentCents - a.spentCents;
    return a.categoryName.localeCompare(b.categoryName, "pt-BR");
  });
}

type LimitCellProps = {
  row: BudgetRow;
  saveLimit: (categoryId: string, limitCents: number | null) => Promise<boolean>;
  isSaving: boolean;
};

function LimitCell({ row, saveLimit, isSaving }: LimitCellProps) {
  const [value, setValue] = useState(() =>
    row.limitCents === null
      ? ""
      : formatCentsInput(digitsOf(String(row.limitCents))),
  );
  const [dirty, setDirty] = useState(false);

  function revert() {
    setValue(
      row.limitCents === null
        ? ""
        : formatCentsInput(digitsOf(String(row.limitCents))),
    );
    setDirty(false);
  }

  async function commit() {
    if (!dirty || isSaving) return;

    if (value.trim() === "") {
      if (row.limitCents === null) {
        setDirty(false);
        return;
      }
      const saved = await saveLimit(row.categoryId, null);
      if (saved) {
        setDirty(false);
        toast.success("Limite removido.");
      } else {
        revert();
      }
      return;
    }

    const cents = parseBrlToCents(value);
    if (cents <= 0) {
      toast.error("Informe um limite maior que zero.");
      revert();
      return;
    }
    if (cents === row.limitCents) {
      setDirty(false);
      return;
    }

    const saved = await saveLimit(row.categoryId, cents);
    if (saved) {
      setDirty(false);
      toast.success("Limite atualizado.");
    } else {
      revert();
    }
  }

  return (
    <Input
      inputMode="numeric"
      className="h-8 w-36 tabular-nums"
      value={value}
      placeholder="Sem limite"
      disabled={isSaving}
      aria-label={`Limite de ${row.categoryName}`}
      onChange={(event) => {
        setValue(formatCentsInput(digitsOf(event.target.value)));
        setDirty(true);
      }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          revert();
        }
      }}
    />
  );
}

export function OrcamentosView() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [today] = useState(() => new Date());

  const budgetQuery = useQuery({
    queryKey: ["budgets", "status", month],
    queryFn: async () => {
      const result = await getBudgetStatusAction(month);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const result = await getCategoriesAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary", month],
    queryFn: async () => {
      const result = await getMonthlySummaryAction(month);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const limitMutation = useMutation({
    mutationFn: (input: { categoryId: string; limitCents: number | null }) =>
      input.limitCents === null
        ? clearBudgetLimitAction({ categoryId: input.categoryId, month })
        : setBudgetLimitAction({
            categoryId: input.categoryId,
            month,
            limitCents: input.limitCents,
          }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      invalidate();
    },
    onError: () => toast.error("Não foi possível salvar o limite."),
  });

  const copyMutation = useMutation({
    mutationFn: (from: string) => copyBudgetAction({ from, to: month }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { copied } = result.data;
      toast.success(
        copied > 0
          ? `${copied} limite(s) copiado(s).`
          : "Nenhum limite novo para copiar.",
      );
      invalidate();
    },
    onError: () => toast.error("Não foi possível copiar o orçamento."),
  });

  async function saveLimit(
    categoryId: string,
    limitCents: number | null,
  ): Promise<boolean> {
    try {
      const result = await limitMutation.mutateAsync({ categoryId, limitCents });
      return result.ok;
    } catch {
      return false;
    }
  }

  const rows = useMemo(() => {
    const byId = new Map<string, BudgetRow>();
    for (const row of budgetQuery.data ?? []) {
      byId.set(row.categoryId, row);
    }
    for (const category of categoriesQuery.data ?? []) {
      if (category.type !== "expense" || byId.has(category.id)) continue;
      byId.set(category.id, {
        categoryId: category.id,
        categoryName: category.name,
        color: category.color,
        limitCents: null,
        spentCents: 0,
        remainingCents: null,
        percentUsed: null,
      });
    }
    return sortRows([...byId.values()]);
  }, [budgetQuery.data, categoriesQuery.data]);

  const incomeCents = summaryQuery.data?.totalIncomeCents ?? 0;
  const totalLimit = totalLimitCents(rows.map((row) => row.limitCents));
  const totalSpent = rows.reduce((sum, row) => sum + row.spentCents, 0);
  const projectedBalance = incomeCents - totalLimit;
  const overIncome = totalLimit > incomeCents;

  const alertPercent = rows.map((row) => row.percentUsed);
  const alertCount = countBudgetAlerts(alertPercent);
  const overLimitRows = rows.filter((row) => (row.percentUsed ?? 0) >= 100);
  const nearLimitRows = rows.filter(
    (row) =>
      row.percentUsed !== null && row.percentUsed >= 80 && row.percentUsed < 100,
  );

  const chartData = useMemo(
    () =>
      rows
        .filter((row) => row.limitCents !== null || row.spentCents > 0)
        .sort(
          (a, b) =>
            Math.max(b.limitCents ?? 0, b.spentCents) -
            Math.max(a.limitCents ?? 0, a.spentCents),
        )
        .slice(0, 12)
        .map((row) => ({
          name: row.categoryName,
          limite: row.limitCents ?? 0,
          gasto: row.spentCents,
        })),
    [rows],
  );

  const chartConfig = {
    limite: { label: "Limite", theme: { light: "#94a3b8", dark: "#64748b" } },
    gasto: { label: "Gasto", theme: { light: "#ef4444", dark: "#f87171" } },
  } satisfies ChartConfig;

  const isLoading =
    budgetQuery.isLoading || categoriesQuery.isLoading || summaryQuery.isLoading;
  const isError = budgetQuery.isError || categoriesQuery.isError;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
        <p className="text-sm text-destructive">
          Não foi possível carregar o orçamento. Confira se a migration da Fase 3
          foi aplicada.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void budgetQuery.refetch();
            void categoriesQuery.refetch();
            void summaryQuery.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Defina limites por categoria e acompanhe o gasto real do mês.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav value={month} onChange={setMonth} />
          <Button
            variant="outline"
            disabled={copyMutation.isPending}
            onClick={() => copyMutation.mutate(addMonthsToKey(month, -1))}
          >
            {copyMutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyIcon />
            )}
            Copiar orçamento do mês anterior
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="flex flex-col gap-2 py-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex flex-col gap-1 py-6">
              <CardDescription>Receita do mês</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">
                {centsToBrl(incomeCents)}
              </CardTitle>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-6">
              <CardDescription>Total orçado</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {centsToBrl(totalLimit)}
              </CardTitle>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-6">
              <CardDescription>Total gasto</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-red-600 dark:text-red-400">
                {centsToBrl(totalSpent)}
              </CardTitle>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-6">
              <CardDescription>Saldo previsto</CardDescription>
              <CardTitle
                className={`text-2xl tabular-nums ${
                  projectedBalance >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {centsToBrl(projectedBalance)}
              </CardTitle>
            </CardContent>
          </Card>
        </div>
      )}

      {overIncome ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Limites acima da receita</AlertTitle>
          <AlertDescription>
            A soma dos limites ({centsToBrl(totalLimit)}) ultrapassa a receita do
            mês ({centsToBrl(incomeCents)}) em {centsToBrl(totalLimit - incomeCents)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {overLimitRows.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>
            {overLimitRows.length} categoria(s) no limite ou acima
          </AlertTitle>
          <AlertDescription>
            {overLimitRows.map((row) => row.categoryName).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      {nearLimitRows.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {nearLimitRows.length} categoria(s) passaram de 80% do limite
          </AlertTitle>
          <AlertDescription>
            {nearLimitRows.map((row) => row.categoryName).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PieChartIcon}
          title="Nenhuma categoria de despesa"
          description="Crie categorias de despesa em Categorias para montar o orçamento do mês."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Limite</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Restante</TableHead>
                <TableHead className="w-48">Uso</TableHead>
                <TableHead className="text-right">Projeção</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const tone = budgetTone(row.percentUsed);
                const percent = row.percentUsed;
                const projected = projectedMonthEnd({
                  monthKey: month,
                  spentCents: row.spentCents,
                  today,
                });
                const risk = willExceedLimit(projected, row.limitCents);

                return (
                  <TableRow key={row.categoryId}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              row.color ?? "var(--muted-foreground)",
                          }}
                        />
                        {row.categoryName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <LimitCell
                        key={`${row.categoryId}:${row.limitCents ?? "none"}`}
                        row={row}
                        saveLimit={saveLimit}
                        isSaving={limitMutation.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {centsToBrl(row.spentCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.remainingCents === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            row.remainingCents < 0
                              ? "text-red-600 dark:text-red-400"
                              : undefined
                          }
                        >
                          {centsToBrl(row.remainingCents)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full ${
                                tone ? TONE_BAR[tone] : "bg-primary"
                              }`}
                              style={{
                                width: `${Math.min(percent ?? 0, 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                              tone ? TONE_TEXT[tone] : "text-muted-foreground"
                            }`}
                          >
                            {percent === null ? "sem limite" : `${percent}%`}
                          </span>
                        </div>
                        {tone === "atencao" || tone === "estouro" ? (
                          <Badge
                            variant="outline"
                            className={
                              tone === "estouro"
                                ? "w-fit border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                                : "w-fit border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }
                          >
                            {tone === "estouro"
                              ? "Estourou o limite"
                              : "Atenção: ≥80%"}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {projected === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="tabular-nums">
                            {centsToBrl(projected)}
                          </span>
                          {risk ? (
                            <Badge
                              variant="outline"
                              className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                            >
                              Vai estourar
                            </Badge>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Limite vs. gasto por categoria</CardTitle>
          <CardDescription>
            {alertCount > 0
              ? `${alertCount} categoria(s) em alerta neste mês`
              : "Nenhuma categoria em alerta neste mês"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sem limites nem gastos para comparar neste mês.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-80 min-h-80 w-full">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) =>
                    centsToBrlCompact(Number(value))
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => centsToBrl(Number(value))}
                    />
                  }
                />
                <Bar
                  dataKey="limite"
                  fill="var(--color-limite)"
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                />
                <Bar
                  dataKey="gasto"
                  fill="var(--color-gasto)"
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
