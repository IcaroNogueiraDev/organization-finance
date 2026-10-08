"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { addMonthsToKey, formatMonthLabel, toMonthKey } from "@/lib/finance/dates";

type MonthPickerProps = {
  value: string;
  onChange: (month: string) => void;
  className?: string;
};

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const currentMonth = toMonthKey(new Date());

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mês anterior"
        onClick={() => onChange(addMonthsToKey(value, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-44 text-center text-sm font-medium capitalize">
        {formatMonthLabel(value)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Próximo mês"
        disabled={value >= currentMonth}
        onClick={() => onChange(addMonthsToKey(value, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
