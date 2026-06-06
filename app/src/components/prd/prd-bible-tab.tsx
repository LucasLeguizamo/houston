import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import type { AskCard } from "./prd-model";
import { PrdWiki } from "./prd-wiki";
import { PrdOnboardingStart } from "./prd-onboarding-start";
import { PrdInterview } from "./prd-interview";

type Mode = "start" | "interview" | "wiki";

/** The "Bible" tab body: onboarding start → interview → wiki, per the mode. */
export function PrdBibleTab({
  workspaceId,
  prd,
  provider,
  model,
  mode,
  onMode,
  persist,
  onAsk,
  onComplete,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  mode: Mode;
  onMode: (m: Mode) => void;
  persist: (next: Prd) => Promise<unknown>;
  onAsk: (card: AskCard) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation("prd");

  if (mode === "start") {
    return (
      <PrdOnboardingStart
        workspaceId={workspaceId}
        prd={prd}
        provider={provider}
        model={model}
        onPrdUpdate={persist}
        onStarted={() => onMode("interview")}
      />
    );
  }

  if (mode === "interview") {
    return (
      <div className="flex flex-col gap-6">
        <PrdInterview
          workspaceId={workspaceId}
          prd={prd}
          provider={provider}
          model={model}
          onPrdUpdate={persist}
          onComplete={onComplete}
        />
        <PrdWiki prd={prd} onChange={persist} onAsk={onAsk} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => onMode("interview")}
        >
          <Sparkles className="size-3.5" />
          {t("wiki.improve")}
        </Button>
      </div>
      <PrdWiki prd={prd} onChange={persist} onAsk={onAsk} />
    </div>
  );
}
