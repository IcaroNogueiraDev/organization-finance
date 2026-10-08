"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PlusIcon, TargetIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { GoalCard } from "@/components/metas/goal-card";
import { GoalDetailDialog } from "@/components/metas/goal-detail-dialog";
import type { GoalProgressItem } from "@/lib/actions/goals";
import {
  createGoalAction,
  deleteGoalAction,
  getGoalsAction,
  setGoalStatusAction,
  updateGoalAction,
} from "@/lib/actions/goals";
import { getMonthlySeriesAction } from "@/lib/actions/dashboard";
import { todayKey } from "@/lib/finance/dates";
import { centsToBrl, digitsOf, formatCentsInput, parseBrlToCents } from "@/lib/finance/money";
import { freeBalanceAverage } from "@/lib/finance/savings";
import type { GoalFormValues, GoalStatus } from "@/lib/schemas/goal";
import { goalFormSchema } from "@/lib/schemas/goal";

const STATUS_TOAST: Record<GoalStatus, string> = {
  active: "Meta em andamento.",
  paused: "Meta pausada.",
  done: "Meta concluída.",
};

export function MetasView() {
  const queryClient = useQueryClient();
  const [today] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GoalProgressItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const result = await getGoalsAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const seriesQuery = useQuery({
    queryKey: ["dashboard", "series", 4],
    queryFn: async () => {
      const result = await getMonthlySeriesAction(4);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const series = seriesQuery.data ?? [];
  const closedMonths = series.slice(0, Math.max(series.length - 1, 0));
  const freeBalanceAvgCents = freeBalanceAverage(
    closedMonths.slice(-3).map((point) => point.balanceCents),
  );

  const goals = goalsQuery.data ?? [];
  const detailGoal = goals.find((goal) => goal.id === detailId) ?? null;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: { name: "", target: "", deadline: undefined },
  });

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      reset({
        name: editing.name,
        target: formatCentsInput(digitsOf(String(editing.targetCents))),
        deadline: editing.deadline ?? undefined,
      });
    } else {
      reset({ name: "", target: "", deadline: undefined });
    }
  }, [dialogOpen, editing, reset]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["goals"] });
  }

  const saveMutation = useMutation({
    mutationFn: (values: GoalFormValues) => {
      const payload = {
        name: values.name,
        targetCents: parseBrlToCents(values.target),
        deadline: values.deadline ?? null,
      };
      return editing
        ? updateGoalAction(editing.id, payload)
        : createGoalAction(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Meta atualizada." : "Meta criada.");
      invalidate();
      setDialogOpen(false);
    },
    onError: () => toast.error("Não foi possível salvar a meta."),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: GoalStatus }) =>
      setGoalStatusAction(input.id, input.status),
    onSuccess: (result, input) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(STATUS_TOAST[input.status]);
      invalidate();
    },
    onError: () => toast.error("Não foi possível atualizar a meta."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGoalAction(id),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        setDeletingId(null);
        return;
      }
      toast.success("Meta excluída.");
      invalidate();
      setDeletingId(null);
    },
    onError: () => {
      toast.error("Não foi possível excluir a meta.");
      setDeletingId(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Metas</h1>
          <p className="text-sm text-muted-foreground">
            Crie metas com valor e prazo, veja o aporte mensal e registre aportes.
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon />
          Nova meta
        </Button>
      </header>

      {goalsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : goalsQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
          <p className="text-sm text-destructive">
            {goalsQuery.error instanceof Error
              ? goalsQuery.error.message
              : "Não foi possível carregar as metas. Confira se a migration da Fase 3 foi aplicada."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void goalsQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={TargetIcon}
          title="Nenhuma meta criada"
          description="Defina o valor e o prazo para calcular o aporte mensal necessário e acompanhar o progresso."
          action={
            <Button onClick={openCreate}>
              <PlusIcon />
              Criar primeira meta
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Saldo livre médio (últimos 3 meses fechados):{" "}
            <span className="tabular-nums">{centsToBrl(freeBalanceAvgCents)}</span>
            {seriesQuery.isError ? " · histórico indisponível" : ""}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                freeBalanceAvgCents={freeBalanceAvgCents}
                today={today}
                onOpenDetail={() => setDetailId(goal.id)}
                onEdit={() => {
                  setEditing(goal);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeletingId(goal.id)}
                onStatusChange={(status) =>
                  statusMutation.mutate({ id: goal.id, status })
                }
                isStatusPending={
                  statusMutation.isPending &&
                  statusMutation.variables?.id === goal.id
                }
                isDeletePending={
                  deleteMutation.isPending &&
                  deleteMutation.variables === goal.id
                }
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
            <DialogDescription>
              Sem prazo, você informa o aporte mensal desejado para ver a
              viabilidade.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-name">Nome</Label>
              <Input
                id="goal-name"
                placeholder="Ex.: Reserva de emergência"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-target">Valor alvo</Label>
              <Controller
                control={control}
                name="target"
                render={({ field }) => (
                  <Input
                    id="goal-target"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    aria-invalid={errors.target ? true : undefined}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(formatCentsInput(digitsOf(event.target.value)))
                    }
                  />
                )}
              />
              {errors.target ? (
                <p className="text-sm text-destructive">{errors.target.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-deadline">Prazo (opcional)</Label>
              <Controller
                control={control}
                name="deadline"
                render={({ field }) => (
                  <Input
                    id="goal-deadline"
                    type="date"
                    min={todayKey()}
                    aria-invalid={errors.deadline ? true : undefined}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === "" ? undefined : event.target.value,
                      )
                    }
                  />
                )}
              />
              {errors.deadline ? (
                <p className="text-sm text-destructive">
                  {errors.deadline.message}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {detailGoal ? (
        <GoalDetailDialog
          goal={detailGoal}
          freeBalanceAvgCents={freeBalanceAvgCents}
          today={today}
          open={detailId !== null}
          onOpenChange={(open) => {
            if (!open) setDetailId(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              A meta e todos os aportes registrados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
