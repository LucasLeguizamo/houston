import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Package,
  Users,
  DollarSign,
  Target,
  Cog,
  Palette,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { SECTIONS, getField, isFieldFilled } from "./prd-model";
import { FieldDialog } from "./prd-field-dialog";

const SECTION_ICON: Record<string, LucideIcon> = {
  company: Building2,
  product: Package,
  market: Users,
  businessModel: DollarSign,
  goals: Target,
  operations: Cog,
  brand: Palette,
};

function preview(value: string | string[]): string {
  return Array.isArray(value)
    ? value.filter((v) => v.trim()).join(" · ")
    : value.trim();
}

/**
 * Wiki view of the Company Bible: every section is a category, every field a
 * card. Click a card to read/edit it in a dialog. Doubles as the browsable
 * single source of truth once the interview has filled it in.
 */
export function PrdWiki({
  prd,
  onChange,
  onAsk,
}: {
  prd: Prd;
  onChange: (next: Prd) => void;
  /** Send a field to the Houston chat ("how should we implement this?"). */
  onAsk?: (label: string, value: string) => void;
}) {
  const { t } = useTranslation("prd");
  const [editing, setEditing] = useState<{ section: string; field: string; kind: "text" | "list" } | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">{t("wiki.subtitle")}</p>

      {SECTIONS.map((section) => {
        const Icon = SECTION_ICON[section.id] ?? Package;
        return (
          <section key={section.id}>
            <div className="mb-3 flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                {t(`sections.${section.id}`)}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => {
                const value = getField(prd, section.id, field.key);
                const filled = isFieldFilled(value);
                const label = t(`fields.${section.id}.${field.key}`);
                // Primary click sends the card into the Houston chat so it can
                // propose an edit / extension / modification. The pencil opens
                // the manual editor.
                const ask = () => onAsk?.(label, filled ? preview(value) : "");
                const edit = () =>
                  setEditing({ section: section.id, field: field.key, kind: field.kind });
                return (
                  <div
                    key={field.key}
                    role="button"
                    tabIndex={0}
                    onClick={onAsk ? ask : edit}
                    className={cn(
                      "group relative flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-left",
                      "cursor-pointer transition-colors hover:border-primary/30 hover:bg-primary/[0.03]",
                    )}
                  >
                    <span className="pr-7 text-sm font-medium">{label}</span>
                    <span
                      className={cn(
                        "line-clamp-3 text-sm",
                        filled ? "text-muted-foreground" : "italic text-muted-foreground/50",
                      )}
                    >
                      {filled ? preview(value) : t("wiki.empty")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("wiki.edit")}
                      onClick={(e) => {
                        e.stopPropagation();
                        edit();
                      }}
                      className={cn(
                        "absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground",
                        "opacity-60 transition-opacity hover:bg-secondary hover:text-foreground",
                        "group-hover:opacity-100",
                      )}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {editing && (
        <FieldDialog
          prd={prd}
          section={editing.section}
          field={editing.field}
          kind={editing.kind}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            onChange(next);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
