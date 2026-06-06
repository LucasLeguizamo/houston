import { useTranslation } from "react-i18next";
import { Sparkles, Plus, CalendarClock, Wand2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@houston-ai/core";
import type {
  AgentRecommendation,
  StrategyRecommendation,
} from "@houston-ai/engine-client";
import { usePrdRecommend } from "../../hooks/queries";
import { useUIStore } from "../../stores/ui";

function AgentCard({ rec }: { rec: AgentRecommendation }) {
  const { t } = useTranslation("prd");
  const openCreate = useUIStore((s) => s.setCreateAgentDialogOpen);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          {rec.name}
          <Badge variant="secondary">
            {Math.round(rec.relevance * 100)}%
          </Badge>
        </CardTitle>
        <CardDescription>{rec.reason}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rec.matchedNeeds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rec.matchedNeeds.map((need) => (
              <Badge key={need} variant="outline">
                {need}
              </Badge>
            ))}
          </div>
        )}
        <Button size="sm" className="self-start" onClick={() => openCreate(true)}>
          <Plus className="size-4" />
          {t("recommend.addAgent")}
        </Button>
      </CardContent>
    </Card>
  );
}

function StrategyCard({ rec }: { rec: StrategyRecommendation }) {
  const { t } = useTranslation("prd");
  const Icon = rec.kind === "routine" ? CalendarClock : Wand2;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {rec.title}
          <Badge variant="outline">{t(`recommend.kind.${rec.kind}`)}</Badge>
        </CardTitle>
        <CardDescription>{rec.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{rec.reason}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Generate + render agent and strategy recommendations from the saved bible.
 * The mutation reads the persisted PRD on the engine, so the bible must be
 * saved (it is, on every edit / interview turn) before recommending.
 */
export function PrdRecommendations({
  workspaceId,
  provider,
  model,
}: {
  workspaceId: string;
  provider: string;
  model: string;
}) {
  const { t } = useTranslation("prd");
  const recommend = usePrdRecommend(workspaceId);
  const data = recommend.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t("recommend.intro")}</p>
        <Button
          className="self-start"
          onClick={() => recommend.mutate({ provider, model })}
          disabled={recommend.isPending}
        >
          {recommend.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {data ? t("recommend.refresh") : t("recommend.generate")}
        </Button>
      </div>

      {data && (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t("recommend.agentsTitle")}</h3>
            {data.agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("recommend.noAgents")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.agents.map((rec) => (
                  <AgentCard key={rec.agentId} rec={rec} />
                ))}
              </div>
            )}
          </section>

          {data.strategies.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">
                {t("recommend.strategiesTitle")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.strategies.map((rec, i) => (
                  <StrategyCard key={`${rec.title}-${i}`} rec={rec} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
