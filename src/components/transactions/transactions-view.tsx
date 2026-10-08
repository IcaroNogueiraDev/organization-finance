"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  Trash2Icon,
  ArrowLeftRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState } from "@/components/empty-state";
import { KindBadge, KIND_LABELS } from "@/components/kind-badge";
import { MonthPicker } from "@/components/month-picker";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { getCategoriesAction } from "@/lib/actions/categories";
import type { TransactionListItem } from "@/lib/actions/transactions";
import {
  bulkSetCategoryAction,
  deleteTransactionAction,
  getTransactionsAction,
} from "@/lib/actions/transactions";
import type { TransactionFilters } from "@/lib/schemas/transaction";
import { TRANSACTION_PAGE_SIZE } from "@/lib/schemas/transaction";
import { formatDate, toMonthKey } from "@/lib/finance/dates";
import { centsToBrl } from "@/lib/finance/money";
import type { CategoryKind } from "@/lib/database.types";

type TypeFilter = "all" | "income" | "expense";

export function TransactionsView() {
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [type, setType] = useState<TypeFilter>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [kind, setKind] = useState<CategoryKind | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"occurred_on" | "amount_cents">(
    "occurred_on",
  );
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // A busca usa valor diferido: digita livre e a consulta acompanha sem
  // efeitos de reset (o reset de página/seleção acontece nos handlers).
  const deferredSearch = useDeferredValue(search.trim());

  function resetPaging() {
    setPage(1);
    setSelectedIds([]);
    setBulkCategoryId("all");
  }

  const filters: TransactionFilters = useMemo(
    () => ({
      month,
      type,
      categoryId: categoryId === "all" ? null : categoryId,
      kind: kind === "all" ? null : kind,
      search: deferredSearch || null,
      sort,
      dir,
      page,
    }),
    [month, type, categoryId, kind, deferredSearch, sort, dir, page],
  );

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const result = await getCategoriesAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      const result = await getTransactionsAction(filters);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const categories = categoriesQuery.data ?? [];
  const rows = transactionsQuery.data?.rows ?? [];
  const total = transactionsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TRANSACTION_PAGE_SIZE));

  const bulkMutation = useMutation({
    mutationFn: (input: { ids: string[]; categoryId: string }) =>
      bulkSetCategoryAction(input),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.updated} transação(ões) atualizada(s).`);
      setSelectedIds([]);
      setBulkCategoryId("all");
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Não foi possível atualizar as transações."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransactionAction(id),
    onSuccess: (result, id) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Transação excluída.");
      setSelectedIds((current) => current.filter((item) => item !== id));
      if (page > 1 && rows.length === 1) {
        setPage(page - 1);
      }
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Não foi possível excluir a transação."),
  });

  function toggleSort(nextSort: "occurred_on" | "amount_cents") {
    if (sort === nextSort) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(nextSort);
      setDir("desc");
    }
    resetPaging();
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  const allPageSelected =
    rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  function toggleAllPage() {
    if (allPageSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !rows.some((row) => row.id === id)),
      );
    } else {
      setSelectedIds((current) => [
        ...new Set([...current, ...rows.map((row) => row.id)]),
      ]);
    }
  }

  const hasActiveFilters =
    type !== "all" ||
    categoryId !== "all" ||
    kind !== "all" ||
    deferredSearch !== "";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">
            {transactionsQuery.isLoading
              ? "Carregando..."
              : `${total} transação(ões) no mês`}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon />
          Nova transação
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker
          value={month}
          onChange={(value) => {
            setMonth(value);
            resetPaging();
          }}
        />

        <Tabs
          value={type}
          onValueChange={(value) => {
            setType(value as TypeFilter);
            resetPaging();
          }}
        >
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="income">Receitas</TabsTrigger>
            <TabsTrigger value="expense">Despesas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPaging();
            }}
            placeholder="Buscar descrição"
            className="w-56 pl-8"
            aria-label="Buscar por descrição"
          />
        </div>

        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value);
            resetPaging();
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filtrar por categoria">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={kind}
          onValueChange={(value) => {
            setKind(value as CategoryKind | "all");
            resetPaging();
          }}
        >
          <SelectTrigger
            className="w-44"
            aria-label="Filtrar por classificação"
          >
            <SelectValue placeholder="Classificação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda classificação</SelectItem>
            {(Object.keys(KIND_LABELS) as CategoryKind[]).map((kindKey) => (
              <SelectItem key={kindKey} value={kindKey}>
                {KIND_LABELS[kindKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setType("all");
              setCategoryId("all");
              setKind("all");
              setSearch("");
              resetPaging();
            }}
          >
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedIds.length} selecionada(s)
          </span>
          <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
            <SelectTrigger className="w-56" aria-label="Mover para categoria">
              <SelectValue placeholder="Mover para categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name} (
                  {category.type === "income" ? "receita" : "despesa"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={bulkCategoryId === "all" || bulkMutation.isPending}
            onClick={() =>
              bulkMutation.mutate({
                ids: selectedIds,
                categoryId: bulkCategoryId,
              })
            }
          >
            {bulkMutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Limpar seleção
          </Button>
        </div>
      ) : null}

      {transactionsQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
          <p className="text-sm text-destructive">
            {transactionsQuery.error instanceof Error
              ? transactionsQuery.error.message
              : "Não foi possível carregar as transações."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void transactionsQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : transactionsQuery.isLoading ? (
        <div className="rounded-md border">
          <Table>
            <TableBody>
              {Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title={
            hasActiveFilters
              ? "Nenhuma transação com esses filtros"
              : "Nenhuma transação ainda"
          }
          description={
            hasActiveFilters
              ? "Ajuste os filtros ou limpe a busca para ver outras transações."
              : "Cadastre sua primeira receita ou despesa para começar a acompanhar suas finanças."
          }
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon />
              Adicionar primeira transação
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleAllPage}
                    aria-label="Selecionar todas da página"
                  />
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort("occurred_on")}
                  >
                    Data
                    {sort === "occurred_on" ? (
                      dir === "asc" ? (
                        <ArrowUpIcon className="size-3.5" />
                      ) : (
                        <ArrowDownIcon className="size-3.5" />
                      )
                    ) : null}
                  </Button>
                </TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort("amount_cents")}
                  >
                    Valor
                    {sort === "amount_cents" ? (
                      dir === "asc" ? (
                        <ArrowUpIcon className="size-3.5" />
                      ) : (
                        <ArrowDownIcon className="size-3.5" />
                      )
                    ) : null}
                  </Button>
                </TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isSelected = selectedIds.includes(row.id);
                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(row.id)}
                        aria-label={`Selecionar transação ${row.description ?? ""}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(row.occurred_on)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {row.description ?? "Sem descrição"}
                        {row.is_recurring ? (
                          <RepeatIcon
                            className="size-3.5 text-muted-foreground"
                            aria-label="Recorrente"
                          />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              row.categories?.color ??
                              "var(--muted-foreground)",
                          }}
                        />
                        {row.categories?.name ?? "Sem categoria"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={row.categories?.kind ?? null} />
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        row.type === "income"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ""
                      }`}
                    >
                      {row.type === "income" ? "+" : "-"}
                      {centsToBrl(row.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar transação"
                          onClick={() => {
                            setEditing(row);
                            setDialogOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir transação"
                          onClick={() => setDeletingId(row.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {total} no total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || transactionsQuery.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || transactionsQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        transaction={editing}
        defaultMonth={month}
      />

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita.
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
