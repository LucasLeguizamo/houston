import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import {
  Button,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Spinner,
} from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { useWorkspaceStore } from "../../stores/workspaces";
import { getDefaultModel, getProvider } from "../../lib/providers";
import {
  useActivateBible,
  useBible,
  useBibles,
  useCreateBible,
  useDeleteBible,
  useSaveBible,
} from "../../hooks/queries";
import { computeCompleteness, emptyPrd } from "./prd-model";
import { PrdBibleBar } from "./prd-bible-bar";
import { PrdBibleTab } from "./prd-bible-tab";
import { PrdRecommendations } from "./prd-recommendations";
import { PrdAgentSidebar } from "./prd-agent-sidebar";
import { PrdChat } from "./prd-chat";
import { Centered, ViewTab } from "./prd-bits";
import { downloadBible } from "./prd-export";

type View = "bible" | "recommend";

export function CompanyBible() {
  const { t } = useTranslation("prd");
  const workspace = useWorkspaceStore((s) => s.current);
  const workspaceId = workspace?.id;
  const { data: list, isLoading } = useBibles(workspaceId);
  const create = useCreateBible(workspaceId);
  const save = useSaveBible(workspaceId);
  const remove = useDeleteBible(workspaceId);
  const activate = useActivateBible(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("bible");
  const [mode, setMode] = useState<"start" | "interview" | "wiki" | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [injected, setInjected] = useState<{ text: string; nonce: number } | null>(null);

  const bibles = list?.bibles ?? [];
  const activeId = list?.activeId ?? "";
  const selected = selectedId ?? (activeId || bibles[0]?.id || "");
  const provider = workspace?.provider ?? "anthropic";
  const model = modelOverride ?? workspace?.model ?? getDefaultModel(provider);
  const models = getProvider(provider)?.models ?? [];
  const { data: bibleData } = useBible(workspaceId, selected || undefined);
  const prd: Prd = bibleData ?? emptyPrd();
  const completeness = computeCompleteness(prd);

  // Re-derive the per-bible view mode whenever the selected bible changes.
  useEffect(() => setMode(null), [selected]);

  if (!workspace) {
    return (
      <Centered>
        <EmptyHeader>
          <EmptyTitle>{t("noWorkspace.title")}</EmptyTitle>
          <EmptyDescription>{t("noWorkspace.description")}</EmptyDescription>
        </EmptyHeader>
      </Centered>
    );
  }

  const newBible = () =>
    create.mutate(t("bibles.defaultName"), {
      onSuccess: (meta) => {
        setSelectedId(meta.id);
        setMode("start");
        setView("bible");
      },
    });

  if (!isLoading && bibles.length === 0) {
    return (
      <Centered>
        <EmptyHeader>
          <EmptyTitle>{t("bibles.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("bibles.emptyBody")}</EmptyDescription>
        </EmptyHeader>
        <Button className="mt-4" onClick={newBible} disabled={create.isPending}>
          {create.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
          {t("bibles.create")}
        </Button>
      </Centered>
    );
  }

  const persist = (next: Prd) => save.mutateAsync({ bibleId: selected, prd: next });
  const effectiveMode = mode ?? (completeness === 0 && !prd.role ? "start" : "wiki");

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
            <ViewTab active={view === "recommend"} onClick={() => setView("recommend")}>
              <Sparkles className="size-3.5" />
              {t("tabs.recommend")}
            </ViewTab>
          </div>
        </div>
        <div className="mt-3">
          <PrdBibleBar
            bibles={bibles}
            activeId={activeId}
            selectedId={selected}
            models={models}
            model={model}
            onSelect={(id) => setSelectedId(id)}
            onCreate={newBible}
            onActivate={(id) => activate.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
            onExport={() => downloadBible(bibles.find((b) => b.id === selected)?.name, prd)}
            onModel={setModelOverride}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={completeness} className="h-1.5 max-w-xs" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("completeness", { percent: completeness })}
          </span>
          {save.isPending && <Spinner className="size-3.5" />}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5" />
            </div>
          ) : view === "bible" ? (
            <PrdBibleTab
              workspaceId={workspace.id}
              prd={prd}
              provider={provider}
              model={model}
              mode={effectiveMode}
              onMode={setMode}
              persist={persist}
              onAsk={(label, value) =>
                setInjected({
                  text: value.trim()
                    ? t("chat.askAbout", { label, value })
                    : t("chat.askEmpty", { label }),
                  nonce: Date.now(),
                })
              }
              onComplete={() => {
                setMode("wiki");
                setView("recommend");
              }}
            />
          ) : (
            <PrdRecommendations
              workspaceId={workspace.id}
              prd={prd}
              provider={provider}
              model={model}
            />
          )}
        </div>
        </div>
        <PrdAgentSidebar
          workspaceId={workspace.id}
          prd={prd}
          provider={provider}
          model={model}
        />
      </div>
      <PrdChat
        workspaceId={workspace.id}
        prd={prd}
        provider={provider}
        model={model}
        injected={injected}
        onInjectedConsumed={() => setInjected(null)}
      />
    </div>
  );
}
