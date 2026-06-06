import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button, Spinner, cn } from "@houston-ai/core";
import type { Prd, PrdQuestion } from "@houston-ai/engine-client";
import { usePrdApplyAnswers, usePrdQuestions } from "../../hooks/queries";
import { PrdCard } from "./prd-card";

type Phase = "loading" | "asking" | "applying" | "done";

/**
 * Two-call quick-insight interview: one call generates every question, the user
 * answers them instantly (no per-question round trip), one call folds them in.
 */
export function PrdInterview({
  workspaceId,
  prd,
  provider,
  model,
  onPrdUpdate,
  onComplete,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  onPrdUpdate: (next: Prd) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation("prd");
  const questionsMut = usePrdQuestions(workspaceId);
  const applyMut = usePrdApplyAnswers(workspaceId);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<PrdQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");

  // Generate all questions once on mount.
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    questionsMut.mutate(
      { prd, provider, model },
      {
        onSuccess: (qs) => {
          if (qs.length === 0) {
            setPhase("done");
            return;
          }
          setQuestions(qs);
          setAnswers(new Array(qs.length).fill(""));
          setPhase("asking");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (all: string[]) => {
    setPhase("applying");
    const pairs = questions
      .map((q, i) => ({ question: q.question, answer: all[i] ?? "" }))
      .filter((p) => p.answer.trim().length > 0);
    applyMut.mutate(
      { prd, answers: pairs, provider, model },
      {
        onSuccess: (merged) => {
          onPrdUpdate(merged);
          setPhase("done");
        },
        onError: () => setPhase("asking"),
      },
    );
  };

  const advance = (value: string) => {
    const next = answers.slice();
    next[idx] = value;
    setAnswers(next);
    setAnswer("");
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
    } else {
      finish(next);
    }
  };

  const goBack = () => {
    if (idx === 0) return;
    const prev = idx - 1;
    setIdx(prev);
    setAnswer(answers[prev] ?? "");
  };

  if (phase === "loading" || phase === "applying") {
    return (
      <PrdCard>
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {phase === "loading" ? t("interview.preparing") : t("interview.building")}
        </div>
      </PrdCard>
    );
  }

  if (phase === "done") {
    return (
      <PrdCard>
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-5 text-primary" />
        </div>
        <h2 className="mt-4 text-[22px] font-normal leading-snug">
          {t("interview.doneTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("interview.complete")}</p>
        <div className="mt-5 flex justify-end">
          <Button className="rounded-full" onClick={onComplete}>
            <Sparkles className="size-4" />
            {t("interview.viewRecommendations")}
          </Button>
        </div>
      </PrdCard>
    );
  }

  const q = questions[idx];
  return (
    <PrdCard>
      <p className="text-xs text-muted-foreground">
        {t("interview.stepOf", { step: idx + 1, total: questions.length })}
      </p>
      <h2 className="mt-2 text-[22px] font-normal leading-snug">{q.question}</h2>

      {q.suggestions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("interview.suggestionsHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {q.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => advance(s)}
                className={cn(
                  "rounded-full border border-border bg-secondary px-3 py-1.5",
                  "text-sm text-foreground transition-colors",
                  "hover:bg-primary/10 hover:border-primary/30",
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
            advance(answer);
          }
        }}
        placeholder={t("interview.orType")}
        rows={2}
        className={cn(
          "mt-4 w-full resize-none rounded-lg border border-black/[0.06] bg-background",
          "px-3 py-2 text-sm leading-relaxed outline-none",
          "placeholder:text-muted-foreground/60 transition-shadow duration-200",
          "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        )}
      />

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <Button variant="ghost" className="rounded-full" onClick={goBack}>
              <ArrowLeft className="size-4" />
              {t("interview.back")}
            </Button>
          )}
          <Button variant="ghost" className="rounded-full" onClick={() => advance("")}>
            {t("interview.skipQuestion")}
          </Button>
        </div>
        <Button className="rounded-full" onClick={() => advance(answer)}>
          <ArrowRight className="size-4" />
          {idx + 1 < questions.length
            ? t("interview.continue")
            : t("interview.finish")}
        </Button>
      </div>
    </PrdCard>
  );
}
