import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Send, Sparkles, X } from "lucide-react";
import { Button, cn } from "@houston-ai/core";
import type { Prd, PrdChatMessage } from "@houston-ai/engine-client";
import { usePrdChat } from "../../hooks/queries";
import { PrdThinking } from "./prd-thinking";
import type { AskCard } from "./prd-model";

type Msg = PrdChatMessage & { card?: AskCard };
const ACTIONS = ["autocomplete", "modify", "extend"] as const;

// Houston chat docked under the bible (PRD-architect skill). A clicked card
// attaches as context; the input adds instructions; action buttons autocomplete
// / modify / extend it; and each card reply gets an "Update bible" button.
export function PrdChat({
  workspaceId,
  prd,
  provider,
  model,
  injected,
  onInjectedConsumed,
  onApply,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  injected: (AskCard & { nonce: number }) | null;
  onInjectedConsumed: () => void;
  onApply: (card: AskCard, content: string) => void;
}) {
  const { t } = useTranslation("prd");
  const chat = usePrdChat(workspaceId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<AskCard | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    const card = attached ?? undefined;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    chat.mutate(
      {
        prd,
        messages: history,
        message: msg,
        context: card ? `${card.label}: ${card.value}` : undefined,
        provider,
        model,
      },
      {
        onSuccess: (reply) =>
          setMessages((m) => [...m, { role: "assistant", content: reply, card }]),
        onError: () => setMessages((m) => m.slice(0, -1)),
      },
    );
  };
  // A card was clicked: attach it as context and focus the input — don't send.
  useEffect(() => {
    if (!injected) return;
    const { nonce: _n, ...card } = injected;
    setAttached(card);
    inputRef.current?.focus();
    onInjectedConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected?.nonce]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, chat.isPending]);
  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-3xl px-6 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          {t("chat.title")}
        </div>

        {(messages.length > 0 || chat.isPending) && (
          <div ref={scrollRef} className="mb-2 max-h-56 overflow-y-auto rounded-xl bg-secondary/50 p-3">
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col gap-1",
                    m.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.card && (
                    <Button
                      size="sm"
                      variant={applied.has(i) ? "secondary" : "default"}
                      className="h-7 rounded-full text-xs"
                      disabled={applied.has(i)}
                      onClick={() => {
                        onApply(m.card!, m.content);
                        setApplied((s) => new Set(s).add(i));
                      }}
                    >
                      <Check className="size-3.5" />
                      {applied.has(i)
                        ? t("chat.updated")
                        : t("chat.update", { label: m.card.label })}
                    </Button>
                  )}
                </div>
              ))}
              {chat.isPending && (
                <div className="self-start rounded-lg bg-background px-3 py-2 text-sm">
                  <PrdThinking phrases={[t("thinking.replying")]} />
                </div>
              )}
            </div>
          </div>
        )}

        {attached && (
          <div className="mb-2 flex flex-col gap-2">
            <div className="flex items-center gap-2 self-start rounded-full bg-primary/10 py-1 pl-3 pr-1 text-xs">
              <span className="font-medium text-foreground">{attached.label}</span>
              <button
                type="button"
                aria-label={t("chat.removeContext")}
                onClick={() => setAttached(null)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={chat.isPending}
                  onClick={() =>
                    send(input.trim() ? `${t(`chat.actions.${a}`)}. ${input.trim()}` : t(`chat.actions.${a}`))
                  }
                  className={cn(
                    "rounded-full border border-border bg-secondary px-3 py-1 text-xs",
                    "transition-colors hover:bg-primary/10 hover:border-primary/30 disabled:opacity-50",
                  )}
                >
                  {t(`chat.actions.${a}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={attached ? t("chat.placeholderContext") : t("chat.placeholder")}
            rows={1}
            className={cn(
              "min-h-9 flex-1 resize-none rounded-lg border border-black/[0.06] bg-background",
              "px-3 py-2 text-sm leading-relaxed outline-none",
              "placeholder:text-muted-foreground/60 focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            )}
          />
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => send(input)}
            disabled={!input.trim() || chat.isPending}
            aria-label={t("chat.send")}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
