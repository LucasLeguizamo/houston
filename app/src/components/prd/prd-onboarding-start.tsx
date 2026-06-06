import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Globe, Upload, ArrowRight } from "lucide-react";
import { Button, Spinner, cn } from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { usePrdIngest } from "../../hooks/queries";

const ROLES = ["founder", "cLevel", "vp", "pm", "investor", "operator"] as const;
// Stored as a stable lowercase token; the model reads it to frame the interview.
const ROLE_VALUE: Record<(typeof ROLES)[number], string> = {
  founder: "founder",
  cLevel: "c-level",
  vp: "vp",
  pm: "pm",
  investor: "investor",
  operator: "operator",
};

/**
 * First onboarding screen: pick a role (frames the whole interview) and
 * optionally drop in a website or document to pre-fill the bible. Styled after
 * Houston's coachmark tutorial. On continue it persists the role, runs ingestion
 * if material was given, then hands off to the question flow.
 */
export function PrdOnboardingStart({
  workspaceId,
  prd,
  provider,
  model,
  onPrdUpdate,
  onStarted,
}: {
  workspaceId: string;
  prd: Prd;
  provider: string;
  model: string;
  onPrdUpdate: (next: Prd) => Promise<unknown>;
  onStarted: () => void;
}) {
  const { t } = useTranslation("prd");
  const ingestMut = usePrdIngest(workspaceId);
  const [role, setRole] = useState<string>("");
  const [url, setUrl] = useState("");
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = ingestMut.isPending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setDocText(text);
    setDocName(file.name);
  };

  const proceed = () => {
    const withRole: Prd = { ...prd, role: role || prd.role };
    const trimmedUrl = url.trim();
    if (trimmedUrl || docText.trim()) {
      ingestMut.mutate(
        {
          prd: withRole,
          url: trimmedUrl || undefined,
          text: trimmedUrl ? undefined : docText,
          provider,
          model,
        },
        {
          // Persist the merged bible AND wait for the cache to update before
          // starting, so the first question reflects the ingested data.
          onSuccess: async (merged) => {
            await onPrdUpdate(merged);
            onStarted();
          },
        },
      );
      return;
    }
    void (async () => {
      await onPrdUpdate(withRole);
      onStarted();
    })();
  };

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-black/5 bg-background p-6 shadow-[0_10px_40px_rgba(0,0,0,0.10)]">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="size-5 text-primary" />
      </div>
      <h2 className="mt-4 text-[22px] font-normal leading-snug">
        {t("start.title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("start.body")}</p>

      <p className="mt-5 text-sm font-medium">{t("start.roleQuestion")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const value = ROLE_VALUE[r];
          const active = role === value;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRole(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-foreground hover:bg-primary/5",
              )}
            >
              {t(`roles.${r}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl bg-secondary/60 p-4">
        <p className="text-sm font-medium">{t("start.ingestTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("start.ingestBody")}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("start.urlPlaceholder")}
            disabled={busy}
            className={cn(
              "w-full rounded-lg border border-black/[0.06] bg-background px-3 py-2",
              "text-sm outline-none placeholder:text-muted-foreground/60",
              "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            )}
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.markdown,.json,.csv,.html,.htm"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled={busy || !!url.trim()}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            {docName || t("start.uploadDoc")}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("start.docNote")}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          className="rounded-full"
          onClick={proceed}
          disabled={busy}
        >
          {t("start.skip")}
        </Button>
        <Button className="rounded-full" onClick={proceed} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : <ArrowRight className="size-4" />}
          {busy ? t("start.ingesting") : t("start.continue")}
        </Button>
      </div>
    </div>
  );
}
