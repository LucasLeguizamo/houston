import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  Button,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
import {
  cleanProposedValue,
  computeCompleteness,
  emptyPrd,
  setField,
  type AskCard,
} from "./prd-model";
import { PrdHeader, type View } from "./prd-header";
import { PrdBibleTab } from "./prd-bible-tab";
import { PrdStrategies } from "./prd-strategies";
import { PrdRecommendations } from "./prd-recommendations";
import { PrdAgentSidebar } from "./prd-agent-sidebar";
import { PrdChat } from "./prd-chat";
import { Centered } from "./prd-bits";
import { downloadBible, parseBibleExport } from "./prd-export";
import { useUIStore } from "../../stores/ui";

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
  const [injected, setInjected] = useState<(AskCard & { nonce: number }) | null>(null);
  const bibles = list?.bibles ?? [];
  const activeId = list?.activeId ?? "";
  const selected = selectedId ?? (activeId || bibles[0]?.id || "");
  const provider = workspace?.provider ?? "anthropic";
  // Default to the provider's fast model (the workspace may be pinned to a slow
  // one like Opus that times out on the bigger prompts); user can override above.
  const model = modelOverride ?? getDefaultModel(provider);
  const models = getProvider(provider)?.models ?? [];
  const { data: bibleData } = useBible(workspaceId, selected || undefined);
  const prd: Prd = bibleData ?? emptyPrd();
  const completeness = computeCompleteness(prd);
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
  // Write a chat-produced value back into the bible card it was about.
  const applyToBible = (card: AskCard, content: string) => {
    const c = cleanProposedValue(content);
    const value =
      card.kind === "list" ? c.split("\n").map(cleanProposedValue).filter(Boolean) : c;
    void persist(setField(prd, card.section, card.field, value));
  };
  const importBible = (file: File) =>
    file.text().then(parseBibleExport).then(async (p) => {
      const m = await create.mutateAsync(p.name);
      await save.mutateAsync({ bibleId: m.id, prd: p.prd });
      setSelectedId(m.id);
      setMode("wiki");
    }).catch(() =>
      useUIStore.getState().addToast({ title: t("bibles.importFailed"), variant: "error" }),
    );
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PrdHeader
        view={view}
        onView={setView}
        completeness={completeness}
        saving={save.isPending}
        bar={{
          bibles,
          activeId,
          selectedId: selected,
          models,
          model,
          onSelect: setSelectedId,
          onCreate: newBible,
          onActivate: (id) => activate.mutate(id),
          onDelete: (id) => remove.mutate(id),
          onExport: () => downloadBible(bibles.find((b) => b.id === selected)?.name, prd),
          onImport: importBible,
          onModel: setModelOverride,
        }}
      />
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
              onAsk={(card) => setInjected({ ...card, nonce: Date.now() })}
              onComplete={() => {
                setMode("wiki");
                setView("strategies");
              }}
            />
          ) : view === "strategies" ? (
            <PrdStrategies
              workspaceId={workspace.id}
              prd={prd}
              provider={provider}
              model={model}
              persist={persist}
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
          onLinkAgents={(links) => {
            const have = new Set(prd.agents?.map((a) => a.id) ?? []);
            const added = links.filter((l) => !have.has(l.id));
            if (added.length) void persist({ ...prd, agents: [...(prd.agents ?? []), ...added] });
          }}
        />
      </div>
      <PrdChat
        workspaceId={workspace.id}
        prd={prd}
        provider={provider}
        model={model}
        injected={injected}
        onInjectedConsumed={() => setInjected(null)}
        onApply={applyToBible}
      />
    </div>
  );
}
