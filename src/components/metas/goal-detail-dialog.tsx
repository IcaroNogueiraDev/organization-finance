"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { ViabilityBadge, VIABILITY_HINTS } from "@/components/metas/viability-badge";
import {
  createContributionAction,
  deleteContributionAction,
  getContributionsAction,
  type GoalProgressItem,
} from "@/lib/actions/goals";
import { formatDate, todayKey } from "@/lib/finance/dates";
import {
  centsToBrl,
  digitsOf,
  formatCentsInput,
  parseBrlToCents,
} from "@/lib/finance/money";
import { buildContributionPlan } from "@/lib/finance/savings";
import type { ContributionFormValues } from "@/lib/schemas/goal";
import { contributionFormSchema } from "@/lib/schemas/goal";

type GoalDetailDialogProps = {
  goal: GoalProgressItem;
  freeBalanceAvgCents: number;
  today: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function GoalDetailDialog({
  goal,
  freeBalanceAvgCents,
  today,
  open,
  onOpenChange,
}: GoalDetailDialogProps) {
  const queryClient = useQueryClient();
  const [plannedText, setPlannedText] = useState("");

  const plannedCents = parseBrlToCents(plannedText);
  const plan = buildContributionPlan({
    targetCents: goal.targetCents,
    savedCents: goal.savedCents,
    monthsLeft: goal.monthsLeft,
    freeBalanceAvgCents,
    plannedCents: plannedCents > 0 ? plannedCents : null,
    today,
  });

  const contributionsQuery = useQuery({
    queryKey: ["contributions", goal.id],
    queryFn: async () => {
      const result = await getContributionsAction(goal.id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionFormSchema),
    defaultValues: { amount: "", contributedOn: todayKey() },
  });

  useEffect(() => {
    if (open) reset({ amount: "", contributedOn: todayKey() });
  }, [open, reset]);
  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["goals"] });
    void queryClient.invalidateQueries({ queryKey: ["contributions"] });
  }

  const createMutation = useMutation({
    mutationFn: (values: ContributionFormValues) =>
      createContributionAction({
        goalId: goal.id,
        amountCents: parseBrlToCents(values.amount),
        contributedOn: values.contributedOn,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aporte registrado.");
      reset({ amount: "", contributedOn: todayKey() });
      invalidate();
    },
    onError: () => toast.error("Não foi possível registrar o aporte."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContributionAction(id),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aporte removido.");
      invalidate();
    },
    onError: () => toast.error("Não foi possível remover o aporte."),
  });

  const contributions = contributionsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{goal.name}</DialogTitle>
          <DialogDescription>
            Progresso, plano de poupança e aportes da meta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <SummaryCell label="Alvo" value={centsToBrl(goal.targetCents)} />
          <SummaryCell label="Guardado" value={centsToBrl(goal.savedCents)} />
          <SummaryCell label="Restante" value={centsToBrl(plan.remainingCents)} />
          <SummaryCell
            label="Prazo"
            value={
              goal.deadline
                ? `${formatDate(goal.deadline)}${
                    goal.monthsLeft !== null
                      ? ` · ${goal.monthsLeft} mês(es)`
                      : ""
                  }`
                : "Sem prazo"
            }
          />
        </div>

        <section className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Plano de poupança</h3>
            {plan.viability ? (
              <ViabilityBadge level={plan.viability} />
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Saldo livre médio (últimos 3 meses fechados):{" "}
            <span className="tabular-nums">
              {centsToBrl(freeBalanceAvgCents)}
            </span>
          </p>

          {goal.monthsLeft !== null ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Aporte necessário</span>
              <span className="font-medium tabular-nums">
                {plan.aporteCents !== null
                  ? `${centsToBrl(plan.aporteCents)}/mês`
                  : "Meta já atingida"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="planned-contribution">Aporte mensal desejado</Label>
              <Input
                id="planned-contribution"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={plannedText}
                onChange={(event) =>
                  setPlannedText(formatCentsInput(digitsOf(event.target.value)))
                }
              />
            </div>
          )}

          {plan.viability && plan.differenceCents !== null ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="tabular-nums">
                {plan.differenceCents >= 0
                  ? `Sobra estimada de ${centsToBrl(plan.differenceCents)}/mês`
                  : `Faltam ${centsToBrl(-plan.differenceCents)}/mês para o saldo livre médio`}
              </span>
              <span className="text-xs text-muted-foreground">
                {VIABILITY_HINTS[plan.viability]}
              </span>
            </div>
          ) : null}

          {plan.estimatedDate ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Conclusão estimada</span>
              <span className="font-medium">{formatDate(plan.estimatedDate)}</span>
            </div>
          ) : null}

          {goal.monthsLeft === null && plan.aporteCents === null ? (
            <p className="text-xs text-muted-foreground">
              Informe o aporte mensal para ver a viabilidade e a data estimada de
              conclusão.
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-md border p-3">
          <h3 className="text-sm font-medium">Aportes</h3>

          <form
            onSubmit={handleSubmit((values) => createMutation.mutate(values))}
            className="flex flex-wrap items-start gap-2"
            noValidate
          >
            <div className="flex min-w-36 flex-1 flex-col gap-1">
              <Label htmlFor="contribution-amount">Valor</Label>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <Input
                    id="contribution-amount"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    aria-invalid={errors.amount ? true : undefined}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(formatCentsInput(digitsOf(event.target.value)))
                    }
                  />
                )}
              />
              {errors.amount ? (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              ) : null}
            </div>

            <div className="flex min-w-36 flex-col gap-1">
              <Label htmlFor="contribution-date">Data</Label>
              <Controller
                control={control}
                name="contributedOn"
                render={({ field }) => (
                  <Input
                    id="contribution-date"
                    type="date"
                    max={todayKey()}
                    aria-invalid={errors.contributedOn ? true : undefined}
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                )}
              />
              {errors.contributedOn ? (
                <p className="text-xs text-destructive">
                  {errors.contributedOn.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="mt-6"
            >
              {createMutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlusIcon />
              )}
              Adicionar
            </Button>
          </form>

          {contributionsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : contributionsQuery.isError ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar os aportes.
            </p>
          ) : contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum aporte registrado ainda.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {contributions.map((contribution) => (
                <li
                  key={contribution.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="text-sm tabular-nums">
                    {formatDate(contribution.contributedOn)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {centsToBrl(contribution.amountCents)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover aporte"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(contribution.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
