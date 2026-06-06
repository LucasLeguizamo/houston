import { useTranslation } from "react-i18next";
import { Check, Plus } from "lucide-react";
import { Badge, Button, Spinner } from "@houston-ai/core";
import type { AgentRecommendation } from "@houston-ai/engine-client";

export type CreateStatus = "idle" | "busy" | "done";

/** A recommended agent with a Create button (install Store / generate custom). */
export function PrdAgentCard({
  rec,
  status,
  onCreate,
}: {
  rec: AgentRecommendation;
  status: CreateStatus;
  onCreate: () => void;
}) {
  const { t } = useTranslation("prd");
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{rec.name}</span>
        <Badge variant="secondary">{Math.round(rec.relevance * 100)}%</Badge>
      </div>
      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{rec.reason}</p>
      <Button
        size="sm"
        variant={status === "done" ? "secondary" : "default"}
        className="mt-2 w-full rounded-full"
        onClick={onCreate}
        disabled={status !== "idle"}
      >
        {status === "busy" ? (
          <Spinner className="size-4" />
        ) : status === "done" ? (
          <Check className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
        {status === "done" ? t("sidebar.added") : t("sidebar.create")}
      </Button>
    </div>
  );
}
