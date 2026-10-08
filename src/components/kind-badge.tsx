import { Badge } from "@/components/ui/badge";
import type { CategoryKind } from "@/lib/database.types";
import { cn } from "cn";

export const KIND_LABELS: Record<CategoryKind, string> = {
  fixed: "Fixa",
  variable: "Variável",
  essential: "Essencial",
  non_essential: "Não essencial",
};

const KIND_CLASSES: Record<CategoryKind, string> = {
  fixed: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  variable:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  essential:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  non_essential:
    "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

type KindBadgeProps = {
  kind: CategoryKind | null;
  className?: string;
};

export function KindBadge({ kind, className }: KindBadgeProps) {
  if (!kind) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        —
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn(KIND_CLASSES[kind], className)}>
      {KIND_LABELS[kind]}
    </Badge>
  );
}
