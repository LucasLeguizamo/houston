import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Sparkles } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { useWorkspaceStore } from "../../stores/workspaces";
import { getDefaultModel, getProvider } from "../../lib/providers";
import { usePrd, useSavePrd } from "../../hooks/queries";
import { computeCompleteness, emptyPrd } from "./prd-model";
import { PrdWiki } from "./prd-wiki";
import { PrdOnboardingStart } from "./prd-onboarding-start";
import { PrdInterview } from "./prd-interview";
import { PrdRecommendations } from "./prd-recommendations";

type View = "bible" | "recommend";

export function CompanyBible() {
  const { t } = useTranslation("prd");
  const workspace = useWorkspaceStore((s) => s.current);
  const workspaceId = workspace?.id;
  const { data, isLoading } = usePrd(workspaceId);
  const save = useSavePrd(workspaceId);
  const [view, setView] = useState<View>("bible");
  const [started, setStarted] = useState(false);
  // Model used for the whole onboarding (interview + ingest + recommend). Lets
  // the user pick a faster model for quick insight. Provider follows the
  // workspace; model defaults to the workspace's, overridable here.
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const provider = workspace?.provider ?? "anthropic";
  const model = modelOverride ?? workspace?.model ?? getDefaultModel(provider);
  const models = getProvider(provider)?.models ?? [];

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("noWorkspace.title")}</EmptyTitle>
            <EmptyDescription>{t("noWorkspace.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const prd: Prd = data ?? emptyPrd();
  const completeness = computeCompleteness(prd);
  // Return the promise so callers (the onboarding start screen) can await the
  // write — and the cache update — before handing off to the question flow,
  // otherwise the first interview turn would run against the pre-ingest bible.
  const persist = (next: Prd) => save.mutateAsync(next);
  // Show the role + ingest start screen only for a brand-new, untouched bible.
  const showStart = !started && !prd.role && completeness === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">{t("title")}</h1>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
            <ViewTab active={view === "bible"} onClick={() => setView("bible")}>
              {t("tabs.bible")}
            </ViewTab>
            <ViewTab
              active={view === "recommend"}
              onClick={() => setView("recommend")}
            >
              <Sparkles className="size-3.5" />
              {t("tabs.recommend")}
            </ViewTab>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={completeness} className="h-1.5 max-w-xs" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("completeness", { percent: completeness })}
          </span>
          {save.isPending && <Spinner className="size-3.5" />}
          {models.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("modelLabel")}
              </span>
              <Select value={model} onValueChange={setModelOverride}>
                <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5" />
            </div>
          ) : view === "bible" ? (
            <div className="flex flex-col gap-6">
              {showStart ? (
                <PrdOnboardingStart
                  workspaceId={workspace.id}
                  prd={prd}
                  provider={provider}
                  model={model}
                  onPrdUpdate={persist}
                  onStarted={() => setStarted(true)}
                />
              ) : (
                <PrdInterview
                  workspaceId={workspace.id}
                  prd={prd}
                  provider={provider}
                  model={model}
                  onPrdUpdate={persist}
                  onComplete={() => setView("recommend")}
                />
              )}
              <PrdWiki prd={prd} onChange={persist} />
            </div>
          ) : (
            <PrdRecommendations
              workspaceId={workspace.id}
              provider={provider}
              model={model}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 gap-1.5 px-3 text-xs",
        active && "bg-background shadow-sm",
      )}
    >
      {children}
    </Button>
  );
}
