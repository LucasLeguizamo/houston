import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Sparkles } from "lucide-react";
import { Button, Spinner, cn } from "@houston-ai/core";
import type { Prd, PrdChatMessage } from "@houston-ai/engine-client";
import { usePrdChat } from "../../hooks/queries";

/**
 * Houston chat docked at the bottom of the Company Bible, grounded in the active
 * bible. Each turn is a real model call with the bible as context. `injected`
 * lets cards push a question into the chat (e.g. "how do I implement this?").
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
  injected: { text: string; nonce: number } | null;
  onInjectedConsumed: () => void;
}) {
  const { t } = useTranslation("prd");
  const chat = usePrdChat(workspaceId);
  const [messages, setMessages] = useState<PrdChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    const history = messages;
    setMessages([...history, { role: "user", content: msg }]);
    setInput("");
    chat.mutate(
      { prd, messages: history, message: msg, provider, model },
      {
        onSuccess: (reply) =>
          setMessages((m) => [...m, { role: "assistant", content: reply }]),
        onError: () =>
          // Drop the optimistic user bubble so they can retry cleanly; the
          // engine call wrapper already surfaced the real error as a toast.
          setMessages((m) => m.slice(0, -1)),
      },
    );
  };

  // A card asked to be discussed — send it as a turn.
  useEffect(() => {
    if (injected) {
      send(injected.text);
      onInjectedConsumed();
    }
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
          <div
            ref={scrollRef}
            className="mb-2 max-h-56 overflow-y-auto rounded-xl bg-secondary/50 p-3"
          >
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
                <div className="self-start rounded-lg bg-background px-3 py-2">
                  <Spinner className="size-4" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={t("chat.placeholder")}
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
