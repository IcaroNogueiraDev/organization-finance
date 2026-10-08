"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonthsToKey, formatMonthLabel } from "@/lib/finance/dates";

type MonthNavProps = {
  /** "yyyy-MM" */
  value: string;
  onChange: (monthKey: string) => void;
  disabled?: boolean;
};

/** Seletor de mês com setas anterior/próximo. */
export function MonthNav({ value, onChange, disabled = false }: MonthNavProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mês anterior"
        disabled={disabled}
        onClick={() => onChange(addMonthsToKey(value, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium capitalize">
        {formatMonthLabel(value)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Próximo mês"
        disabled={disabled}
        onClick={() => onChange(addMonthsToKey(value, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
