import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Sparkles, X } from "lucide-react";
import { Button, cn } from "@houston-ai/core";
import type { Prd, PrdChatMessage } from "@houston-ai/engine-client";
import { usePrdChat } from "../../hooks/queries";
import { PrdThinking } from "./prd-thinking";

type Attached = { label: string; value: string };

/**
 * Houston chat docked under the Company Bible — a PRD-architect skill grounded in
 * the active bible. Clicking a card attaches it as extra context (a chip) rather
 * than sending; quick actions then ask the model to autocomplete / modify /
 * extend that card.
 */
export function PrdChat({
  workspaceId,
  prd,
  provider,
  model,
  injected,
  onInjectedConsumed,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  injected: { label: string; value: string; nonce: number } | null;
  onInjectedConsumed: () => void;
}) {
  const { t } = useTranslation("prd");
  const chat = usePrdChat(workspaceId);
  const [messages, setMessages] = useState<PrdChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    const history = messages;
    const context = attached ? `${attached.label}: ${attached.value}` : undefined;
    setMessages([...history, { role: "user", content: msg }]);
    setInput("");
    chat.mutate(
      { prd, messages: history, message: msg, context, provider, model },
      {
        onSuccess: (reply) =>
          setMessages((m) => [...m, { role: "assistant", content: reply }]),
        // Drop the optimistic bubble on failure; the call wrapper already toasted.
        onError: () => setMessages((m) => m.slice(0, -1)),
      },
    );
  };

  // A card was clicked: attach it as context and focus the input — don't send.
  useEffect(() => {
    if (!injected) return;
    setAttached({ label: injected.label, value: injected.value });
    inputRef.current?.focus();
    onInjectedConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected?.nonce]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, chat.isPending]);

  const actions: Array<"autocomplete" | "modify" | "extend"> = [
    "autocomplete",
    "modify",
    "extend",
  ];

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
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "self-end bg-primary text-primary-foreground"
                      : "self-start bg-background",
                  )}
                >
                  {m.content}
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
              {actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={chat.isPending}
                  onClick={() => send(t(`chat.actions.${a}`))}
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
