import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button, Spinner, cn } from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { usePrdInterview } from "../../hooks/queries";

/**
 * Question flow for the Company Bible, styled after Houston's coachmark tutorial
 * (UiTour): one big question + tap-to-answer suggestion chips so a non-technical
 * user rarely types. Runs the opening turn on mount. Each turn folds the answer
 * in (parent persists) and the model returns the next question. Errors toast via
 * the engine call wrapper, so a failed turn just lets the user retry.
 */
export function PrdInterview({
  workspaceId,
  prd,
  completeness,
  onPrdUpdate,
  onComplete,
}: {
  workspaceId: string;
  prd: Prd;
  completeness: number;
  onPrdUpdate: (next: Prd) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation("prd");
  const interview = usePrdInterview(workspaceId);
  const [question, setQuestion] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const runTurn = (userAnswer: string) => {
    interview.mutate(
      { prd, userAnswer },
      {
        onSuccess: (turn) => {
          onPrdUpdate(turn.prd);
          setAnswer("");
          if (turn.complete || !turn.nextQuestion) {
            setDone(true);
            setQuestion(null);
            setSuggestions([]);
            return;
          }
          setDone(false);
          setQuestion(turn.nextQuestion);
          setSuggestions(turn.suggestions ?? []);
          setStep((s) => s + 1);
        },
      },
    );
  };

  // Kick off the opening question once, when the flow first mounts.
  const kicked = useRef(false);
  useEffect(() => {
    if (!kicked.current) {
      kicked.current = true;
      runTurn("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = interview.isPending;

  if (done) {
    return (
      <Card>
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h2 className="mt-4 text-[22px] font-normal leading-snug">
          {t("interview.doneTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("interview.complete")}
        </p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => runTurn("")}
            disabled={busy}
          >
            {t("interview.keepGoing")}
          </Button>
          <Button className="rounded-full" onClick={onComplete}>
            <Sparkles className="size-4" />
            {t("interview.viewRecommendations")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-xs text-muted-foreground">
        {t("interview.stepLabel", { step, percent: completeness })}
      </p>
      <h2 className="mt-2 min-h-[3rem] text-[22px] font-normal leading-snug">
        {busy && !question ? t("interview.thinking") : question}
      </h2>

      {suggestions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("interview.suggestionsHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => runTurn(s)}
                className={cn(
                  "rounded-full border border-border bg-secondary px-3 py-1.5",
                  "text-sm text-foreground transition-colors",
                  "hover:bg-primary/10 hover:border-primary/30 disabled:opacity-50",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && answer.trim()) {
            runTurn(answer);
          }
        }}
        placeholder={t("interview.orType")}
        rows={2}
        disabled={busy}
        className={cn(
          "mt-4 w-full resize-none rounded-lg border border-black/[0.06] bg-background",
          "px-3 py-2 text-sm leading-relaxed outline-none",
          "placeholder:text-muted-foreground/60 transition-shadow duration-200",
          "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        )}
      />

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          className="rounded-full"
          onClick={() => runTurn("")}
          disabled={busy}
        >
          {t("interview.skipQuestion")}
        </Button>
        <Button
          className="rounded-full"
          onClick={() => answer.trim() && runTurn(answer)}
          disabled={!answer.trim() || busy}
        >
          {busy ? <Spinner className="size-4" /> : <ArrowRight className="size-4" />}
          {t("interview.continue")}
        </Button>
      </div>
    </Card>
  );
}

// Shared focused-card frame, matching the UiTour coachmark aesthetic.
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-black/5 bg-background p-6 shadow-[0_10px_40px_rgba(0,0,0,0.10)]">
      {children}
    </div>
  );
}
