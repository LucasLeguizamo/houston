import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Sparkles } from "lucide-react";
import { Progress, Spinner } from "@houston-ai/core";
import { ViewTab } from "./prd-bits";
import { PrdBibleBar } from "./prd-bible-bar";

export type View = "bible" | "recommend" | "strategies";

/** Company Bible header: title, Bible/Recommendations tabs, the bible bar, and
 * the completeness meter. */
export function PrdHeader({
  view,
  onView,
  completeness,
  saving,
  bar,
}: {
  view: View;
  onView: (v: View) => void;
  completeness: number;
  saving: boolean;
  bar: ComponentProps<typeof PrdBibleBar>;
}) {
  const { t } = useTranslation("prd");
  return (
    <header className="border-b border-border px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
          <ViewTab active={view === "bible"} onClick={() => onView("bible")}>
            {t("tabs.bible")}
          </ViewTab>
          <ViewTab active={view === "strategies"} onClick={() => onView("strategies")}>
            {t("tabs.strategies")}
          </ViewTab>
          <ViewTab active={view === "recommend"} onClick={() => onView("recommend")}>
            <Sparkles className="size-3.5" />
            {t("tabs.recommend")}
          </ViewTab>
        </div>
      </div>
      <div className="mt-3">
        <PrdBibleBar {...bar} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={completeness} className="h-1.5 max-w-xs" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("completeness", { percent: completeness })}
        </span>
        {saving && <Spinner className="size-3.5" />}
      </div>
    </header>
  );
}
