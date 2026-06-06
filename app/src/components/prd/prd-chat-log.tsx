import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button, cn } from "@houston-ai/core";
import type { PrdChatMessage } from "@houston-ai/engine-client";
import { PrdThinking } from "./prd-thinking";
import type { AskCard } from "./prd-model";

export type ChatMsg = PrdChatMessage & { card?: AskCard };

/** Scrollable chat transcript: bubbles, the mission-style thinking indicator,
 * and an "Update bible" button on each reply that targets a card. */
export function PrdChatLog({
  messages,
  pending,
  applied,
  onApply,
}: {
  messages: ChatMsg[];
  pending: boolean;
  applied: Set<number>;
  onApply: (index: number, card: AskCard, content: string) => void;
}) {
  const { t } = useTranslation("prd");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  if (messages.length === 0 && !pending) return null;

  return (
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
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background",
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
                onClick={() => onApply(i, m.card!, m.content)}
              >
                <Check className="size-3.5" />
                {applied.has(i) ? t("chat.updated") : t("chat.update", { label: m.card.label })}
              </Button>
            )}
          </div>
        ))}
        {pending && (
          <div className="self-start rounded-lg bg-background px-3 py-2 text-sm">
            <PrdThinking phrases={[t("thinking.replying")]} />
          </div>
        )}
      </div>
    </div>
  );
}
