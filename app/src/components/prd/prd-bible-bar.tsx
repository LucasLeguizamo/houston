import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Star, Trash2, Download, Upload } from "lucide-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import type { BibleMeta } from "@houston-ai/engine-client";

/** Header controls for the Company Bibles: switch / create / activate / delete /
 * export the selected bible, and pick the onboarding model. */
export function PrdBibleBar({
  bibles,
  activeId,
  selectedId,
  models,
  model,
  onSelect,
  onCreate,
  onActivate,
  onDelete,
  onExport,
  onImport,
  onModel,
}: {
  bibles: BibleMeta[];
  activeId: string;
  selectedId: string;
  models: readonly { id: string; label: string }[];
  model: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onModel: (id: string) => void;
}) {
  const { t } = useTranslation("prd");
  const isActive = selectedId === activeId;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger className="h-8 w-auto min-w-44 gap-1 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {bibles.map((b) => (
            <SelectItem key={b.id} value={b.id} className="text-sm">
              {b.name}
              {b.id === activeId ? ` · ${t("bibles.activeTag")}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <IconBtn label={t("bibles.create")} onClick={onCreate}>
        <Plus className="size-4" />
      </IconBtn>

      {isActive ? (
        <Badge variant="secondary" className="gap-1">
          <Star className="size-3 fill-current" />
          {t("bibles.activeTag")}
        </Badge>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="h-8 rounded-full"
          onClick={() => onActivate(selectedId)}
        >
          <Star className="size-3.5" />
          {t("bibles.setActive")}
        </Button>
      )}

      <IconBtn label={t("bibles.export")} onClick={onExport}>
        <Download className="size-4" />
      </IconBtn>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = "";
        }}
      />
      <IconBtn label={t("bibles.import")} onClick={() => fileInput.current?.click()}>
        <Upload className="size-4" />
      </IconBtn>

      {bibles.length > 1 && (
        <IconBtn label={t("bibles.delete")} onClick={() => onDelete(selectedId)}>
          <Trash2 className="size-4" />
        </IconBtn>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("modelLabel")}</span>
        <Select value={model} onValueChange={onModel}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
