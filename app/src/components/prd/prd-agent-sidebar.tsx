import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Wand2, Bot } from "lucide-react";
import { Button, Spinner, cn } from "@houston-ai/core";
import type { AgentLink, Prd } from "@houston-ai/engine-client";
import { usePrdRecommend } from "../../hooks/queries";
import { PrdThinking } from "./prd-thinking";
import { PrdAgentCard } from "./prd-agent-card";
import { PrdIntegrations } from "./prd-integrations";
import { useBibleAgents } from "./use-bible-agents";

/**
 * Right rail attached to the active bible: the agents created from it (kept
 * permanently), agent recommendations you can create (install Store / generate
 * custom), and suggested data integrations to connect.
 */
export function PrdAgentSidebar({
  workspaceId,
  prd,
  provider,
  model,
  onLinkAgents,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  onLinkAgents: (links: AgentLink[]) => void;
}) {
  const { t } = useTranslation("prd");
  const recommend = usePrdRecommend(workspaceId);
  const { status, createOne, createCustom } = useBibleAgents(workspaceId, prd, provider, model);
  const linked = new Set((prd.agents ?? []).map((a) => a.id));
  const agents = recommend.data?.agents ?? [];

  const createAll = async () => {
    const links: AgentLink[] = [];
    for (const rec of agents) {
      const link = await createOne(rec);
      if (link) links.push(link);
    }
    if (links.length) onLinkAgents(links);
  };

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4 lg:flex">
      {(prd.agents ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Bot className="size-4 text-primary" />
            {t("sidebar.attached")}
          </div>
          {prd.agents.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {a.name}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" />
        {t("sidebar.title")}
      </div>
      <p className="text-xs text-muted-foreground">{t("sidebar.intro")}</p>
      <Button
        size="sm"
        className="rounded-full"
        onClick={() => recommend.mutate({ prd, provider, model })}
        disabled={recommend.isPending}
      >
        {recommend.isPending ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
        {recommend.data ? t("sidebar.refresh") : t("sidebar.suggest")}
      </Button>

      {recommend.isPending && (
        <div className="px-1 text-sm">
          <PrdThinking
            phrases={[t("thinking.reading"), t("thinking.matching"), t("thinking.drafting")]}
          />
        </div>
      )}

      {agents.length > 0 && (
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full"
          onClick={createAll}
          disabled={agents.every(
            (a) => linked.has(a.agentId) || (status[a.agentId] ?? "idle") !== "idle",
          )}
        >
          <Plus className="size-4" />
          {t("sidebar.createAll")}
        </Button>
      )}

      {agents.map((rec) => (
        <PrdAgentCard
          key={rec.agentId}
          rec={rec}
          status={linked.has(rec.agentId) ? "done" : status[rec.agentId] ?? "idle"}
          onCreate={async () => {
            const link = await createOne(rec);
            if (link) onLinkAgents([link]);
          }}
        />
      ))}

      {recommend.data && (
        <Button
          variant="ghost"
          size="sm"
          className={cn("rounded-full", agents.length === 0 && "mt-0")}
          onClick={async () => {
            const link = await createCustom();
            if (link) onLinkAgents([link]);
          }}
          disabled={status["__custom__"] === "busy"}
        >
          {status["__custom__"] === "busy" ? (
            <Spinner className="size-4" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {t("sidebar.generateCustom")}
        </Button>
      )}

      <PrdIntegrations integrations={recommend.data?.integrations ?? []} />
    </aside>
  );
}
