"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryListItem } from "@/lib/actions/categories";
import type { TransactionListItem } from "@/lib/actions/transactions";
import {
  createTransactionAction,
  updateTransactionAction,
} from "@/lib/actions/transactions";
import type {
  TransactionFormValues,
  TransactionInput,
} from "@/lib/schemas/transaction";
import { transactionFormSchema } from "@/lib/schemas/transaction";
import {
  centsToPlain,
  digitsOf,
  formatCentsInput,
  parseBrlToCents,
} from "@/lib/finance/money";

type TransactionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryListItem[];
  transaction: TransactionListItem | null;
  defaultMonth: string;
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  categories,
  transaction,
  defaultMonth,
}: TransactionFormDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      description: "",
      categoryId: "",
      occurredOn: `${defaultMonth}-01`,
      isRecurring: false,
    },
  });

  const watchedType = useWatch({ control, name: "type" });
  const watchedCategoryId = useWatch({ control, name: "categoryId" });

  useEffect(() => {
    if (!open) {
      return;
    }
    if (transaction) {
      reset({
        type: transaction.type,
        amount: centsToPlain(transaction.amount_cents),
        description: transaction.description ?? "",
        categoryId: transaction.categories?.id ?? "",
        occurredOn: transaction.occurred_on,
        isRecurring: transaction.is_recurring ?? false,
      });
    } else {
      reset({
        type: "expense",
        amount: "",
        description: "",
        categoryId: "",
        occurredOn: `${defaultMonth}-01`,
        isRecurring: false,
      });
    }
  }, [open, transaction, defaultMonth, reset]);

  useEffect(() => {
    const category = categories.find((item) => item.id === watchedCategoryId);
    if (category && category.type !== watchedType) {
      setValue("categoryId", "");
    }
  }, [watchedType, watchedCategoryId, categories, setValue]);

  const mutation = useMutation({
    mutationFn: (input: TransactionInput) =>
      transaction
        ? updateTransactionAction(transaction.id, input)
        : createTransactionAction(input),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        transaction ? "Transação atualizada." : "Transação criada.",
      );
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Não foi possível salvar a transação.");
    },
  });

  const typeOptions = categories.filter((item) => item.type === watchedType);
  const amountField = register("amount");

  function onSubmit(values: TransactionFormValues) {
    const input: TransactionInput = {
      type: values.type,
      amountCents: parseBrlToCents(values.amount),
      description: values.description,
      categoryId: values.categoryId,
      occurredOn: values.occurredOn,
      isRecurring: values.isRecurring,
    };
    mutation.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Editar transação" : "Nova transação"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo. O valor é salvo em centavos.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={watchedType === "expense" ? "default" : "outline"}
                aria-pressed={watchedType === "expense"}
                onClick={() => setValue("type", "expense")}
              >
                Despesa
              </Button>
              <Button
                type="button"
                variant={watchedType === "income" ? "default" : "outline"}
                aria-pressed={watchedType === "income"}
                onClick={() => setValue("type", "income")}
              >
                Receita
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Valor</Label>
            <Input
              id="amount"
              inputMode="numeric"
              placeholder="R$ 0,00"
              aria-invalid={errors.amount ? true : undefined}
              {...amountField}
              onChange={(event) => {
                event.target.value = formatCentsInput(
                  digitsOf(event.target.value),
                );
                amountField.onChange(event);
              }}
            />
            {errors.amount ? (
              <p className="text-sm text-destructive">
                {errors.amount.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex.: Supermercado"
              aria-invalid={errors.description ? true : undefined}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Categoria</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    className="w-full"
                    aria-invalid={errors.categoryId ? true : undefined}
                  >
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.categoryId ? (
              <p className="text-sm text-destructive">
                {errors.categoryId.message}
              </p>
            ) : null}
            {typeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma categoria de{" "}
                {watchedType === "income" ? "receita" : "despesa"} ainda — crie
                em Categorias.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="occurredOn">Data</Label>
            <Input
              id="occurredOn"
              type="date"
              aria-invalid={errors.occurredOn ? true : undefined}
              {...register("occurredOn")}
            />
            {errors.occurredOn ? (
              <p className="text-sm text-destructive">
                {errors.occurredOn.message}
              </p>
            ) : null}
          </div>

          <Controller
            control={control}
            name="isRecurring"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRecurring"
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
                <Label htmlFor="isRecurring" className="font-normal">
                  Recorrente (repete todo mês)
                </Label>
              </div>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {transaction ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
