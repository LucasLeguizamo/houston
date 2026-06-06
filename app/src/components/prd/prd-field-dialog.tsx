import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { getField, setField } from "./prd-model";

/** Read/edit one bible field in a dialog (text or newline-separated list). */
export function FieldDialog({
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
