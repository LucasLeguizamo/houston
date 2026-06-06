import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Send } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Spinner,
  cn,
} from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { usePrdInterview } from "../../hooks/queries";

/**
 * Guided AI interview. Each turn folds the user's answer into the bible (the
 * parent persists the returned copy) and surfaces the next question. Errors are
 * surfaced as toasts by the engine call wrapper, so a failed turn just leaves
 * the user able to retry.
 */
export function PrdInterview({
  workspaceId,
  prd,
  onPrdUpdate,
}: {
  workspaceId: string;
  prd: Prd;
  onPrdUpdate: (next: Prd) => void;
}) {
  const { t } = useTranslation("prd");
  const interview = usePrdInterview(workspaceId);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(false);

  const runTurn = (userAnswer: string) => {
    interview.mutate(
      { prd, userAnswer },
      {
        onSuccess: (turn) => {
          onPrdUpdate(turn.prd);
          setQuestion(turn.nextQuestion ?? null);
          setComplete(turn.complete);
          setAnswer("");
        },
      },
    );
  };

  const start = () => {
    setStarted(true);
    runTurn("");
  };

  const submit = () => {
    if (!answer.trim() || interview.isPending) return;
    runTurn(answer);
  };

  if (!started) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            {t("interview.title")}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("interview.intro")}
          </p>
          <Button onClick={start} disabled={interview.isPending}>
            {interview.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t("interview.start")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (complete && !question) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          {t("interview.complete")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm font-medium text-foreground">
            {interview.isPending && !question
              ? t("interview.thinking")
              : question}
          </p>
        </div>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={t("interview.answerPlaceholder")}
          rows={3}
          disabled={interview.isPending}
          className={cn(
            "w-full resize-none rounded-lg border border-black/[0.06] bg-background",
            "px-3 py-2 text-sm leading-relaxed outline-none",
            "placeholder:text-muted-foreground/60 transition-shadow duration-200",
            "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          )}
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!answer.trim() || interview.isPending}>
            {interview.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
            {t("interview.send")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
