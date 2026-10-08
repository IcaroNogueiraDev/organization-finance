"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type { GoalProgressItem } from "@/lib/actions/goals";
import type { GoalStatus } from "@/lib/schemas/goal";
import { formatDate } from "@/lib/finance/dates";
import { centsToBrl } from "@/lib/finance/money";
import { buildContributionPlan } from "@/lib/finance/savings";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  done: "Concluída",
};

function statusBadgeClass(status: GoalStatus): string {
  if (status === "active") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "paused") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "border-primary/40 bg-primary/10 text-primary";
}

type GoalCardProps = {
  goal: GoalProgressItem;
  freeBalanceAvgCents: number;
  today: Date;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: GoalStatus) => void;
  isStatusPending: boolean;
  isDeletePending: boolean;
};

export function GoalCard({
  goal,
  freeBalanceAvgCents,
  today,
  onOpenDetail,
  onEdit,
  onDelete,
  onStatusChange,
  isStatusPending,
  isDeletePending,
}: GoalCardProps) {
  const plan = buildContributionPlan({
    targetCents: goal.targetCents,
    savedCents: goal.savedCents,
    monthsLeft: goal.monthsLeft,
    freeBalanceAvgCents,
    today,
  });
  const progress = Math.min(goal.percent, 100);
  const isDone = goal.status === "done";

  return (
    <Card className={isDone ? "opacity-80" : undefined}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{goal.name}</CardTitle>
          <Badge variant="outline" className={statusBadgeClass(goal.status)}>
            {GOAL_STATUS_LABELS[goal.status]}
          </Badge>
        </div>
        <CardDescription>
          {goal.deadline
            ? `Prazo: ${formatDate(goal.deadline)}`
            : "Sem prazo definido"}
          {goal.monthsLeft !== null
            ? ` · ${goal.monthsLeft} mês(es) restantes`
            : ""}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {centsToBrl(goal.savedCents)}
          </span>
          <span className="text-sm text-muted-foreground">
            de {centsToBrl(goal.targetCents)} ({goal.percent}%)
          </span>
        </div>
        <Progress
          value={progress}
          aria-label={`Progresso da meta ${goal.name}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {isDone ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Meta atingida
            </span>
          ) : (
            <span className="text-muted-foreground">
              Falta {centsToBrl(goal.remainingCents)}
            </span>
          )}
          <span className="tabular-nums">
            {plan.aporteCents !== null
              ? `${centsToBrl(plan.aporteCents)}/mês`
              : "Aporte a definir"}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={onOpenDetail}>
          Detalhes
        </Button>
        {goal.status === "active" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isStatusPending}
            onClick={() => onStatusChange("paused")}
          >
            <PauseIcon />
            Pausar
          </Button>
        ) : null}
        {goal.status === "active" || goal.status === "paused" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isStatusPending}
            onClick={() => onStatusChange("done")}
          >
            <CheckCircle2Icon />
            Concluir
          </Button>
        ) : null}
        {goal.status === "paused" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isStatusPending}
            onClick={() => onStatusChange("active")}
          >
            <PlayIcon />
            Retomar
          </Button>
        ) : null}
        {goal.status === "done" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isStatusPending}
            onClick={() => onStatusChange("active")}
          >
            <RotateCcwIcon />
            Reabrir
          </Button>
        ) : null}
        <span className="ml-auto flex items-center">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Editar meta ${goal.name}`}
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Excluir meta ${goal.name}`}
            disabled={isDeletePending}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </span>
      </CardFooter>
    </Card>
  );
}
