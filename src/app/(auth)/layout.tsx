export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-2xl font-semibold tracking-tight">Org Finance</span>
        <p className="max-w-xs text-sm text-muted-foreground">
          Receitas, despesas, orçamentos e metas em um só lugar.
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
