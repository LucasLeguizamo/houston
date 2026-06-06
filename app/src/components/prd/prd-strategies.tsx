import { useTranslation } from "react-i18next";
import { Sparkles, Check, Wrench, Rocket } from "lucide-react";
import { Button, Progress, Spinner, cn } from "@houston-ai/core";
import type { Prd, StrategyTask } from "@houston-ai/engine-client";
import { usePrdRecommend } from "../../hooks/queries";
import { strategyProgress } from "./prd-model";
import { PrdThinking } from "./prd-thinking";

/**
 * Strategies tab: two task lists — "improve the PRD" and "operate on it" —
 * generated from the bible. Checking tasks off drives the PRD's strategy
 * progress. Tasks live on the bible so they persist.
 */
export function PrdStrategies({
  workspaceId,
  prd,
  provider,
  model,
  persist,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  persist: (next: Prd) => Promise<unknown>;
}) {
  const { t } = useTranslation("prd");
  const recommend = usePrdRecommend(workspaceId);
  const tasks = prd.strategies ?? [];
  const progress = strategyProgress(prd);

  const generate = () =>
    recommend.mutate(
      { prd, provider, model },
      {
        onSuccess: (data) => {
          const next: StrategyTask[] = data.strategies.map((s) => ({
            id: crypto.randomUUID(),
            kind: s.kind,
            goal: s.goal === "operate" ? "operate" : "improve",
            title: s.title,
            description: s.description,
            done: false,
          }));
          void persist({ ...prd, strategies: next });
        },
      },
    );

  const toggle = (id: string) =>
    void persist({
      ...prd,
      strategies: tasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
    });

  const improve = tasks.filter((s) => s.goal !== "operate");
  const operate = tasks.filter((s) => s.goal === "operate");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button className="rounded-full" onClick={generate} disabled={recommend.isPending}>
          {recommend.isPending ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
          {tasks.length > 0 ? t("strategies.regenerate") : t("strategies.generate")}
        </Button>
        {progress !== null && (
          <div className="flex flex-1 items-center gap-3">
            <Progress value={progress} className="h-1.5 max-w-xs" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("strategies.progress", { percent: progress })}
            </span>
          </div>
        )}
      </div>

      {recommend.isPending && (
        <PrdThinking phrases={[t("thinking.reading"), t("thinking.drafting")]} />
      )}

      {tasks.length === 0 && !recommend.isPending && (
        <p className="text-sm text-muted-foreground">{t("strategies.empty")}</p>
      )}

      <StrategyList
        icon={<Wrench className="size-4 text-primary" />}
        title={t("strategies.improve")}
        tasks={improve}
        onToggle={toggle}
        emptyHidden
      />
      <StrategyList
        icon={<Rocket className="size-4 text-primary" />}
        title={t("strategies.operate")}
        tasks={operate}
        onToggle={toggle}
        emptyHidden
      />
    </div>
  );
}

function StrategyList({
  icon,
  title,
  tasks,
  onToggle,
  emptyHidden,
}: {
  icon: React.ReactNode;
  title: string;
  tasks: StrategyTask[];
  onToggle: (id: string) => void;
  emptyHidden?: boolean;
}) {
  const { t } = useTranslation("prd");
  if (tasks.length === 0 && emptyHidden) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {tasks.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onToggle(s.id)}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left",
            "transition-colors hover:border-primary/30",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
              s.done ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {s.done && <Check className="size-3.5" />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>
              {s.title}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                {t(`recommend.kind.${s.kind}`)}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{s.description}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
