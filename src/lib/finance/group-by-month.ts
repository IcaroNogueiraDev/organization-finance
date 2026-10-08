import type { TransactionType } from "@/lib/database.types";

export type MonthBucket = {
  /** "yyyy-MM" */
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  count: number;
};

type TransactionLike = {
  type: TransactionType;
  amount_cents: number;
  occurred_on: string;
};

/**
 * Agrupa transações por mês ("yyyy-MM"), ordenadas do mais antigo para o
 * mais recente. Mesos sem movimento simplesmente não aparecem — quem precisar
 * de meses vazios deve usar a função SQL `monthly_series`.
 */
export function groupTransactionsByMonth(
  transactions: TransactionLike[],
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();

  for (const transaction of transactions) {
    // occurred_on já vem em "yyyy-MM-dd": fatiar evita problema de fuso horário
    const month = transaction.occurred_on.slice(0, 7);
    const bucket = buckets.get(month) ?? {
      month,
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
      count: 0,
    };

    if (transaction.type === "income") {
      bucket.incomeCents += transaction.amount_cents;
    } else {
      bucket.expenseCents += transaction.amount_cents;
    }
    bucket.balanceCents = bucket.incomeCents - bucket.expenseCents;
    bucket.count += 1;
    buckets.set(month, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}
