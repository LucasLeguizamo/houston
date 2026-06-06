import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentLink, AgentRecommendation, Prd } from "@houston-ai/engine-client";
import { tauriAgents, tauriConfig, tauriProvider } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { getField } from "./prd-model";
import type { CreateStatus } from "./prd-agent-card";

/** Create agents from bible recommendations: install the matching Store agent or
 * generate a custom one, grafting the agent's assigned bible cards into its
 * instructions. Returns the created `AgentLink` (or null on failure). */
export function useBibleAgents(
  workspaceId: string,
  prd: Prd,
  provider: string,
  model: string,
) {
  const { t } = useTranslation("prd");
  const storeCatalog = useAgentCatalogStore((s) => s.storeCatalog);
  const installAgent = useAgentCatalogStore((s) => s.installAgent);
  const getById = useAgentCatalogStore((s) => s.getById);
  const createAgent = useAgentStore((s) => s.create);
  const addToast = useUIStore((s) => s.addToast);
  const [status, setStatus] = useState<Record<string, CreateStatus>>({});
  const setS = (key: string, s: CreateStatus) => setStatus((m) => ({ ...m, [key]: s }));

  const summary = `${prd.company.name || "This company"}: ${
    prd.product.whatItIs || prd.company.oneLiner || ""
  }`.trim();

  const excerpt = (cards: string[]): string => {
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

  // Apply the same provider/model preset the Create Agent dialog writes, so a
  // sidebar-created agent behaves identically to a hand-made one.
  const applyPreset = async (folderPath: string) => {
    const { provider: p, model: m } = await tauriProvider.getLastUsed();
    const cfg = await tauriConfig.read(folderPath);
    await tauriConfig.write(folderPath, {
      ...cfg,
      provider: p as "anthropic" | "openai",
      model: m ?? undefined,
    });
  };

  const createOne = async (rec: AgentRecommendation): Promise<AgentLink | null> => {
    if ((status[rec.agentId] ?? "idle") !== "idle") return null;
    const listing = storeCatalog.find((l) => l.id === rec.agentId);
    const slice = excerpt(rec.relevantCards ?? []);
    setS(rec.agentId, "busy");
    try {
      let id: string;
      if (listing) {
        await installAgent(listing);
        const def = getById(listing.id);
        const { agent } = await createAgent(
          workspaceId,
          def?.config.name ?? rec.name,
          listing.id,
          def?.config.color,
          (def?.config.claudeMd ?? "") + slice,
          def?.path,
          def?.config.agentSeeds,
        );
        await applyPreset(agent.folderPath);
        id = agent.id;
      } else {
        const gen = await tauriAgents.generateInstructions(`${summary}. ${rec.reason}`, {
          provider,
          model,
        });
        const { agent } = await createAgent(
          workspaceId,
          gen.name || rec.name,
          "blank",
          undefined,
          gen.instructions + slice,
        );
        await applyPreset(agent.folderPath);
        id = agent.id;
      }
      setS(rec.agentId, "done");
      addToast({ title: t("sidebar.created", { name: rec.name }), variant: "success" });
      return { id, name: rec.name, cards: rec.relevantCards ?? [] };
    } catch {
      setS(rec.agentId, "idle"); // tauri wrappers already toasted the reason
      return null;
    }
  };

  const createCustom = async (): Promise<AgentLink | null> => {
    setS("__custom__", "busy");
    try {
      const gen = await tauriAgents.generateInstructions(summary, { provider, model });
      const name = gen.name || t("sidebar.customName");
      const { agent } = await createAgent(workspaceId, name, "blank", undefined, gen.instructions);
      await applyPreset(agent.folderPath);
      setS("__custom__", "done");
      addToast({ title: t("sidebar.created", { name }), variant: "success" });
      return { id: agent.id, name, cards: [] };
    } catch {
      setS("__custom__", "idle");
      return null;
    }
  };

  return { status, createOne, createCustom };
}
