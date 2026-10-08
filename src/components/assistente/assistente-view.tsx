"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  Loader2Icon,
  PiggyBankIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/actions/assistente";
import {
  clearChatHistoryAction,
  getAiUsageAction,
  getChatHistoryAction,
} from "@/lib/actions/assistente";
import { MAX_MESSAGE_LENGTH } from "@/lib/schemas/assistente";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const HISTORY_KEY = ["assistente", "history"] as const;
const USAGE_KEY = ["assistente", "usage"] as const;

const QUICK_ACTIONS = [
  {
    label: "Analisar meu mês",
    message: "Analise o meu mês: em que estou gastando mais e o que cresceu?",
    analysis: true,
    icon: SparklesIcon,
  },
  {
    label: "Onde posso economizar?",
    message: "Onde posso economizar neste mês?",
    analysis: false,
    icon: WalletIcon,
  },
  {
    label: "Estou perto da minha meta?",
    message: "Estou no caminho certo para alcançar minhas metas?",
    analysis: false,
    icon: PiggyBankIcon,
  },
] as const;

type StreamResult = {
  ok: boolean;
  text: string;
  errorMessage: string;
};

async function readAssistantResponse(response: Response): Promise<StreamResult> {
  if (!response.ok || !response.body) {
    let errorMessage = "Não foi possível enviar a mensagem.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) errorMessage = payload.error;
    } catch {
      // corpo não era JSON; mantém a mensagem genérica
    }
    return { ok: false, text: "", errorMessage };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return { ok: true, text, errorMessage: "" };
}

export function AssistenteView() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [live, setLive] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const historyQuery = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: async () => {
      const result = await getChatHistoryAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const usageQuery = useQuery({
    queryKey: USAGE_KEY,
    queryFn: async () => {
      const result = await getAiUsageAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  const history: ChatMessage[] = historyQuery.data ?? [];
  const messages: UiMessage[] = [...history, ...live];
  const usage = usageQuery.data;
  const quotaReached = usage ? usage.used >= usage.dailyLimit : false;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming]);

  function updateLive(id: string, content: string) {
    setLive((prev) =>
      prev.map((message) => (message.id === id ? { ...message, content } : message)),
    );
  }

  async function send(text: string, analysis: boolean) {
    const content = text.trim();
    if (content.length === 0 || isStreaming) return;
    if (quotaReached) {
      toast.warning("Você atingiu o limite de mensagens de hoje.");
      return;
    }

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: UiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setLive((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, analysis }),
      });

      const result = await readAssistantResponse(response);

      if (!result.ok) {
        setLive((prev) =>
          prev.filter(
            (message) => message.id !== userMessage.id && message.id !== assistantId,
          ),
        );
        setInput(content);
        toast.error(result.errorMessage);
        void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
        return;
      }

      updateLive(assistantId, result.text);

      queryClient.setQueryData<UiMessage[]>(HISTORY_KEY, (old) => [
        ...(old ?? []),
        userMessage,
        { ...assistantMessage, content: result.text },
      ]);
      setLive([]);
      void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
    } catch {
      setLive((prev) =>
        prev.filter(
          (message) => message.id !== userMessage.id && message.id !== assistantId,
        ),
      );
      setInput(content);
      toast.error("Falha de conexão. Tente novamente.");
    } finally {
      setIsStreaming(false);
    }
  }

  async function confirmClear() {
    setClearing(true);
    try {
      const result = await clearChatHistoryAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<UiMessage[]>(HISTORY_KEY, []);
      setLive([]);
      setClearOpen(false);
      toast.success("Conversa apagada.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="size-5" aria-hidden="true" />
              Assistente
            </CardTitle>
            <CardDescription>
              Pergunte sobre seus gastos, orçamento e metas. As respostas usam
              apenas os seus dados agregados.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {usage ? (
              <Badge variant={quotaReached ? "destructive" : "secondary"}>
                {usage.used}/{usage.dailyLimit} hoje
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setClearOpen(true)}
              disabled={messages.length === 0 || isStreaming}
              aria-label="Apagar conversa"
              title="Apagar conversa"
            >
              <Trash2Icon />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex max-h-[55vh] min-h-72 flex-col gap-3 overflow-y-auto rounded-lg border border-border p-3">
            {historyQuery.isLoading ? (
              <>
                <Skeleton className="h-14 w-2/3" />
                <Skeleton className="ml-auto h-14 w-1/2" />
                <Skeleton className="h-14 w-3/5" />
              </>
            ) : messages.length === 0 ? (
              <div className="m-auto max-w-md text-center text-sm text-muted-foreground">
                Comece pedindo uma análise do mês ou uma dica de economia.
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "flex max-w-[85%] items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                  }
                >
                  {message.role === "assistant" ? (
                    <BotIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="whitespace-pre-wrap break-words">
                    {message.content ||
                      (isStreaming && message.role === "assistant"
                        ? "Pensando…"
                        : "")}
                  </span>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                onClick={() => void send(action.message, action.analysis)}
                disabled={isStreaming || quotaReached}
              >
                <action.icon />
                {action.label}
              </Button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input, false);
                }
              }}
              placeholder={
                quotaReached
                  ? "Limite diário atingido. Volte amanhã para continuar."
                  : "Escreva sua pergunta… (Enter envia, Shift+Enter quebra linha)"
              }
              maxLength={MAX_MESSAGE_LENGTH}
              rows={2}
              disabled={isStreaming || quotaReached}
            />
            <Button
              onClick={() => void send(input, false)}
              disabled={isStreaming || quotaReached || input.trim().length === 0}
              aria-label="Enviar mensagem"
            >
              {isStreaming ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              Enviar
            </Button>
          </div>

          {quotaReached ? (
            <p className="text-sm text-muted-foreground">
              Você usou todas as {usage?.dailyLimit} mensagens de hoje. Amanhã a
              cota é liberada novamente.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo o histórico do assistente será removido. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmClear();
              }}
              disabled={clearing}
            >
              {clearing ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
