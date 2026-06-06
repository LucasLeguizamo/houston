import { useTranslation } from "react-i18next";
import { Plug, CalendarClock } from "lucide-react";
import { Button } from "@houston-ai/core";
import type { IntegrationRecommendation } from "@houston-ai/engine-client";
import { useUIStore } from "../../stores/ui";

/** Suggested data integrations (e.g. Stripe financials, GitHub PRs) to connect
 * so the PRD stays live, with a hint of what to pull periodically. */
export function PrdIntegrations({
  integrations,
}: {
  integrations: IntegrationRecommendation[];
}) {
  const { t } = useTranslation("prd");
  const openConnections = useUIStore((s) => s.setViewMode);
  if (integrations.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Plug className="size-4 text-primary" />
        {t("integrations.title")}
      </div>
      {integrations.map((it) => (
        <div key={it.toolkit} className="rounded-xl border border-border bg-card p-3">
          <div className="text-sm font-medium capitalize">
            {it.toolkit.toLowerCase()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{it.reason}</p>
          {it.periodic && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3" />
              {it.periodic}
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 w-full rounded-full"
            onClick={() => openConnections("connections")}
          >
            <Plug className="size-3.5" />
            {t("integrations.connect")}
          </Button>
        </div>
      ))}
    </div>
  );
}
