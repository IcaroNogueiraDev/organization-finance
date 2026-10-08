"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { KindBadge, KIND_LABELS } from "@/components/kind-badge";
import type { CategoryListItem } from "@/lib/actions/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  getCategoriesAction,
  updateCategoryAction,
} from "@/lib/actions/categories";
import type { CategoryFormValues } from "@/lib/schemas/category";
import { categoryFormSchema } from "@/lib/schemas/category";
import type { CategoryKind, TransactionType } from "@/lib/database.types";

const DEFAULT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export function CategoriesManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const result = await getCategoriesAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      type: "expense",
      kind: "variable",
      color: "#64748b",
    },
  });

  const watchedType = useWatch({ control, name: "type" });

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      reset({
        name: editing.name,
        type: editing.type,
        kind: editing.kind ?? "variable",
        color: editing.color ?? "#64748b",
      });
    } else {
      reset({
        name: "",
        type: "expense",
        kind: "variable",
        color: "#64748b",
      });
    }
  }, [dialogOpen, editing, reset]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation({
    mutationFn: (values: CategoryFormValues) => {
      const payload = {
        name: values.name,
        type: values.type,
        kind: values.type === "income" ? null : values.kind ?? null,
        color: values.color ?? null,
      };
      return editing
        ? updateCategoryAction(editing.id, payload)
        : createCategoryAction(payload);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Categoria atualizada." : "Categoria criada.");
      invalidate();
      setDialogOpen(false);
    },
    onError: () => toast.error("Não foi possível salvar a categoria."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategoryAction(id),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        setDeletingId(null);
        return;
      }
      toast.success("Categoria excluída.");
      invalidate();
      setDeletingId(null);
    },
    onError: () => {
      toast.error("Não foi possível excluir a categoria.");
      setDeletingId(null);
    },
  });

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Organize receitas e despesas por categoria e classificação.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon />
          Nova categoria
        </Button>
      </header>

      {categoriesQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : categoriesQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
          <p className="text-sm text-destructive">
            {categoriesQuery.error instanceof Error
              ? categoriesQuery.error.message
              : "Não foi possível carregar as categorias."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void categoriesQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={TagsIcon}
          title="Nenhuma categoria"
          description="Crie categorias para classificar suas receitas e despesas."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon />
              Criar primeira categoria
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            category.color ?? "var(--muted-foreground)",
                        }}
                      />
                      {category.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        category.type === "income"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                      }
                    >
                      {category.type === "income" ? "Receita" : "Despesa"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <KindBadge kind={category.kind} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar categoria ${category.name}`}
                        onClick={() => {
                          setEditing(category);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir categoria ${category.name}`}
                        onClick={() => setDeletingId(category.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar categoria" : "Nova categoria"}
            </DialogTitle>
            <DialogDescription>
              A classificação vale apenas para despesas.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="category-name">Nome</Label>
              <Input
                id="category-name"
                placeholder="Ex.: Alimentação"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) =>
                      field.onChange(value as TransactionType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Despesa</SelectItem>
                      <SelectItem value="income">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {watchedType === "expense" ? (
              <div className="flex flex-col gap-2">
                <Label>Classificação</Label>
                <Controller
                  control={control}
                  name="kind"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "variable"}
                      onValueChange={(value) =>
                        field.onChange(value as CategoryKind)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(KIND_LABELS) as CategoryKind[]).map(
                          (kindKey) => (
                            <SelectItem key={kindKey} value={kindKey}>
                              {KIND_LABELS[kindKey]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.kind ? (
                  <p className="text-sm text-destructive">
                    {errors.kind.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="category-color">Cor</Label>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <input
                      id="category-color"
                      type="color"
                      className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                      value={field.value ?? "#64748b"}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  )}
                />
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Cor ${color}`}
                      className="size-5 rounded-full border border-border"
                      style={{ backgroundColor: color }}
                      onClick={() => setValue("color", color)}
                    />
                  ))}
                </div>
              </div>
              {errors.color ? (
                <p className="text-sm text-destructive">{errors.color.message}</p>
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

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão é bloqueada se a categoria estiver em uso por alguma
              transação.
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
