import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { ViabilityLevel } from "@/lib/finance/savings";

export const VIABILITY_LABELS: Record<ViabilityLevel, string> = {
  viavel: "Viável",
  apertado: "Apertado",
  inviavel: "Inviável",
};

const VIABILITY_STYLE: Record<ViabilityLevel, string> = {
  viavel:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  apertado:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  inviavel: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
};

export const VIABILITY_HINTS: Record<ViabilityLevel, string> = {
  viavel: "Até 50% do saldo livre médio.",
  apertado: "Entre 50% e 90% do saldo livre médio.",
  inviavel: "Acima de 90% do saldo livre médio (ou saldo livre ≤ 0).",
};

export function ViabilityBadge({
  level,
  className,
}: {
  level: ViabilityLevel;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(VIABILITY_STYLE[level], className)}>
      {VIABILITY_LABELS[level]}
    </Badge>
  );
}
