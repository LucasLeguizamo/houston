import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Check, Wand2 } from "lucide-react";
import { Badge, Button, Spinner, cn } from "@houston-ai/core";
import type { AgentRecommendation, Prd } from "@houston-ai/engine-client";
import { usePrdRecommend } from "../../hooks/queries";
import { tauriAgents } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { getField } from "./prd-model";

type Status = "idle" | "busy" | "done";

/**
 * Right rail that turns bible recommendations into real agents: install the
 * matching Store agent if one exists, otherwise generate a custom agent from the
 * bible. Lives beside the Company Bible on wide screens.
 */
export function PrdAgentSidebar({
  workspaceId,
  prd,
  provider,
  model,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
}) {
  const { t } = useTranslation("prd");
  const recommend = usePrdRecommend(workspaceId);
  const storeCatalog = useAgentCatalogStore((s) => s.storeCatalog);
  const installAgent = useAgentCatalogStore((s) => s.installAgent);
  const getById = useAgentCatalogStore((s) => s.getById);
  const createAgent = useAgentStore((s) => s.create);
  const addToast = useUIStore((s) => s.addToast);
  const [status, setStatus] = useState<Record<string, Status>>({});

  const summary = `${prd.company.name || "This company"}: ${
    prd.product.whatItIs || prd.company.oneLiner || ""
  }`.trim();

  const setS = (key: string, s: Status) =>
    setStatus((m) => ({ ...m, [key]: s }));

  // Render the agent's assigned bible cards as a markdown block to graft onto
  // its instructions, so each agent owns its slice of the bible.
  const buildExcerpt = (cards: string[]): string => {
    const lines = cards
      .map((key) => {
        const [section, field] = key.split(".");
        if (!section || !field) return null;
        const v = getField(prd, section, field);
        const text = Array.isArray(v) ? v.filter((x) => x.trim()).join(", ") : v;
        return text.trim() ? `- ${t(`fields.${section}.${field}`)}: ${text.trim()}` : null;
      })
      .filter(Boolean);
    return lines.length ? `\n\n## ${t("sidebar.bibleSlice")}\n${lines.join("\n")}` : "";
  };

  const createOne = async (rec: AgentRecommendation) => {
    if ((status[rec.agentId] ?? "idle") !== "idle") return;
    const listing = storeCatalog.find((l) => l.id === rec.agentId);
    const excerpt = buildExcerpt(rec.relevantCards ?? []);
    setS(rec.agentId, "busy");
    try {
      if (listing) {
        await installAgent(listing);
        const def = getById(listing.id);
        await createAgent(
          workspaceId,
          def?.config.name ?? rec.name,
          listing.id,
          undefined,
          (def?.config.claudeMd ?? "") + excerpt,
          def?.path,
          def?.config.agentSeeds,
        );
      } else {
        const gen = await tauriAgents.generateInstructions(`${summary}. ${rec.reason}`, {
          provider,
          model,
        });
        await createAgent(workspaceId, gen.name || rec.name, "blank", undefined, gen.instructions + excerpt);
      }
      setS(rec.agentId, "done");
      addToast({ title: t("sidebar.created", { name: rec.name }), variant: "success" });
    } catch {
      setS(rec.agentId, "idle"); // tauri wrappers already toasted the reason
    }
  };

  const createAll = async () => {
    for (const rec of recommend.data?.agents ?? []) {
      await createOne(rec);
    }
  };

  const generateCustom = async () => {
    setS("__custom__", "busy");
    try {
      const gen = await tauriAgents.generateInstructions(summary, { provider, model });
      await createAgent(workspaceId, gen.name || t("sidebar.customName"), "blank", undefined, gen.instructions);
      setS("__custom__", "done");
      addToast({ title: t("sidebar.created", { name: gen.name }), variant: "success" });
    } catch {
      setS("__custom__", "idle");
    }
  };

  const agents = recommend.data?.agents ?? [];

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4 lg:flex">
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

      {agents.length > 0 && (
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full"
          onClick={createAll}
          disabled={agents.every((a) => (status[a.agentId] ?? "idle") !== "idle")}
        >
          <Plus className="size-4" />
          {t("sidebar.createAll")}
        </Button>
      )}

      {agents.map((rec) => {
        const s = status[rec.agentId] ?? "idle";
        return (
          <div key={rec.agentId} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{rec.name}</span>
              <Badge variant="secondary">{Math.round(rec.relevance * 100)}%</Badge>
            </div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{rec.reason}</p>
            <Button
              size="sm"
              variant={s === "done" ? "secondary" : "default"}
              className="mt-2 w-full rounded-full"
              onClick={() => createOne(rec)}
              disabled={s !== "idle"}
            >
              {s === "busy" ? (
                <Spinner className="size-4" />
              ) : s === "done" ? (
                <Check className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {s === "done" ? t("sidebar.added") : t("sidebar.create")}
            </Button>
          </div>
        );
      })}

      {recommend.data && (
        <Button
          variant="ghost"
          size="sm"
          className={cn("rounded-full", agents.length === 0 && "mt-0")}
          onClick={generateCustom}
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
    </aside>
  );
}
