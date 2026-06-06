import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Package,
  Users,
  DollarSign,
  Target,
  Cog,
  Palette,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import { SECTIONS, getField, isFieldFilled, setField } from "./prd-model";

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
}: {
  prd: Prd;
  onChange: (next: Prd) => void;
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
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() =>
                      setEditing({
                        section: section.id,
                        field: field.key,
                        kind: field.kind,
                      })
                    }
                    className={cn(
                      "flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-left",
                      "transition-colors hover:border-primary/30 hover:bg-primary/[0.03]",
                    )}
                  >
                    <span className="text-sm font-medium">
                      {t(`fields.${section.id}.${field.key}`)}
                    </span>
                    <span
                      className={cn(
                        "line-clamp-3 text-sm",
                        filled
                          ? "text-muted-foreground"
                          : "italic text-muted-foreground/50",
                      )}
                    >
                      {filled ? preview(value) : t("wiki.empty")}
                    </span>
                  </button>
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

function FieldDialog({
  prd,
  section,
  field,
  kind,
  onClose,
  onSave,
}: {
  prd: Prd;
  section: string;
  field: string;
  kind: "text" | "list";
  onClose: () => void;
  onSave: (next: Prd) => void;
}) {
  const { t } = useTranslation(["prd", "common"]);
  const raw = getField(prd, section, field);
  const [value, setValue] = useState(Array.isArray(raw) ? raw.join("\n") : raw);

  useEffect(() => {
    setValue(Array.isArray(raw) ? raw.join("\n") : raw);
  }, [raw]);

  const save = () => {
    const next =
      kind === "list"
        ? setField(
            prd,
            section,
            field,
            value.split("\n").map((l) => l.trim()).filter(Boolean),
          )
        : setField(prd, section, field, value);
    onSave(next);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`fields.${section}.${field}`)}</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            kind === "list" ? t("fields.listPlaceholder") : t("fields.textPlaceholder")
          }
          rows={kind === "list" ? 6 : 4}
          className={cn(
            "w-full resize-none rounded-lg border border-black/[0.06] bg-background",
            "px-3 py-2 text-sm leading-relaxed outline-none",
            "placeholder:text-muted-foreground/60 focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          )}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={save}>{t("common:actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
