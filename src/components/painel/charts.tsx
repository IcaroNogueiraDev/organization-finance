"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ExpenseByCategory, SeriesPoint } from "@/lib/actions/dashboard";
import { formatMonthShort } from "@/lib/finance/dates";
import { centsToBrl, centsToBrlCompact } from "@/lib/finance/money";

type IncomeExpenseBarChartProps = {
  data: SeriesPoint[];
};

export function IncomeExpenseBarChart({ data }: IncomeExpenseBarChartProps) {
  const chartData = data.map((point) => ({
    month: formatMonthShort(point.month),
    receitas: point.incomeCents,
    despesas: point.expenseCents,
  }));

  const config: ChartConfig = {
    receitas: {
      label: "Receitas",
      theme: { light: "#16a34a", dark: "#22c55e" },
    },
    despesas: {
      label: "Despesas",
      theme: { light: "#ef4444", dark: "#f87171" },
    },
  };

  return (
    <ChartContainer config={config} className="h-72 min-h-72 w-full">
      <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => centsToBrlCompact(Number(value))}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => centsToBrl(Number(value))}
            />
          }
        />
        <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

type ExpensesPieChartProps = {
  data: ExpenseByCategory[];
};

export function ExpensesPieChart({ data }: ExpensesPieChartProps) {
  const chartData = useMemo(
    () =>
      data.map((item, index) => ({
        name: item.categoryName,
        value: item.totalCents,
        fill: item.color ?? `var(--chart-${(index % 5) + 1})`,
      })),
    [data],
  );

  const config: ChartConfig = useMemo(() => {
    const entries: ChartConfig = {};
    data.forEach((item, index) => {
      entries[item.categoryName] = {
        label: item.categoryName,
        color: item.color ?? `var(--chart-${(index % 5) + 1})`,
      };
    });
    return entries;
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="h-56 min-h-56 w-full">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={54}
            outerRadius={86}
            paddingAngle={2}
            stroke="none"
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => centsToBrl(Number(value))}
              />
            }
          />
        </PieChart>
      </ChartContainer>

      <ul className="flex flex-col gap-1.5 text-sm">
        {data.map((item) => (
          <li
            key={item.categoryId ?? item.categoryName}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    item.color ?? "var(--muted-foreground)",
                }}
              />
              <span className="truncate">{item.categoryName}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.percent}% · {centsToBrl(item.totalCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type BalanceLineChartProps = {
  data: SeriesPoint[];
};

export function BalanceLineChart({ data }: BalanceLineChartProps) {
  const chartData = data.map((point) => ({
    month: formatMonthShort(point.month),
    saldo: point.balanceCents,
  }));

  const config: ChartConfig = {
    saldo: {
      label: "Saldo",
      theme: { light: "#2563eb", dark: "#60a5fa" },
    },
  };

  return (
    <ChartContainer config={config} className="h-72 min-h-72 w-full">
      <LineChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => centsToBrlCompact(Number(value))}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => centsToBrl(Number(value))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="saldo"
          stroke="var(--color-saldo)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
