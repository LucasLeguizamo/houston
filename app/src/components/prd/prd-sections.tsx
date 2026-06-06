import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  cn,
} from "@houston-ai/core";
import type { Prd } from "@houston-ai/engine-client";
import {
  SECTIONS,
  getField,
  isFieldFilled,
  setField,
  type FieldDesc,
  type SectionDesc,
} from "./prd-model";

/** A single text or list field. Commits to the parent on blur. */
function FieldEditor({
  sectionId,
  field,
  prd,
  onChange,
}: {
  sectionId: string;
  field: FieldDesc;
  prd: Prd;
  onChange: (next: Prd) => void;
}) {
  const { t } = useTranslation("prd");
  const raw = getField(prd, sectionId, field.key);
  const asText = Array.isArray(raw) ? raw.join("\n") : raw;
  const [value, setValue] = useState(asText);

  useEffect(() => {
    setValue(asText);
  }, [asText]);

  const commit = () => {
    if (value === asText) return;
    const next =
      field.kind === "list"
        ? setField(
            prd,
            sectionId,
            field.key,
            value
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          )
        : setField(prd, sectionId, field.key, value);
    onChange(next);
  };

  const label = t(`fields.${sectionId}.${field.key}`);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder={
          field.kind === "list"
            ? t("fields.listPlaceholder")
            : t("fields.textPlaceholder")
        }
        rows={field.kind === "list" ? 3 : Math.max(2, value.split("\n").length)}
        className={cn(
          "w-full resize-none rounded-lg border border-black/[0.06] bg-background",
          "px-3 py-2 text-sm leading-relaxed text-foreground outline-none",
          "placeholder:text-muted-foreground/60 transition-shadow duration-200",
          "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        )}
      />
    </label>
  );
}

/** Count of filled fields in a section, for the header badge. */
function sectionFilled(prd: Prd, section: SectionDesc): number {
  return section.fields.filter((f) =>
    isFieldFilled(getField(prd, section.id, f.key)),
  ).length;
}

export function PrdSections({
  prd,
  onChange,
}: {
  prd: Prd;
  onChange: (next: Prd) => void;
}) {
  const { t } = useTranslation("prd");
  return (
    <Accordion type="multiple" className="w-full">
      {SECTIONS.map((section) => {
        const filled = sectionFilled(prd, section);
        return (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2">
                {t(`sections.${section.id}`)}
                <Badge variant={filled > 0 ? "secondary" : "outline"}>
                  {filled}/{section.fields.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pt-1">
                {section.fields.map((field) => (
                  <FieldEditor
                    key={field.key}
                    sectionId={section.id}
                    field={field}
                    prd={prd}
                    onChange={onChange}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
