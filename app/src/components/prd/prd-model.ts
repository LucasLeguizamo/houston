import type { Prd } from "@houston-ai/engine-client";

/**
 * Declarative description of the Company Bible so the editor, the completeness
 * meter, and the i18n labels all stay in sync from one source. Section + field
 * ids match the `Prd` shape exactly.
 */
export type FieldKind = "text" | "list";

export interface FieldDesc {
  key: string;
  kind: FieldKind;
}

export interface SectionDesc {
  id: keyof Prd;
  fields: FieldDesc[];
}

/** A bible card handed to the Houston chat as context. */
export interface AskCard {
  section: string;
  field: string;
  kind: FieldKind;
  label: string;
  value: string;
}

export const SECTIONS: SectionDesc[] = [
  {
    id: "company",
    fields: [
      { key: "name", kind: "text" },
      { key: "oneLiner", kind: "text" },
      { key: "stage", kind: "text" },
      { key: "industry", kind: "text" },
      { key: "website", kind: "text" },
      { key: "mission", kind: "text" },
    ],
  },
  {
    id: "product",
    fields: [
      { key: "whatItIs", kind: "text" },
      { key: "problemSolved", kind: "text" },
      { key: "keyFeatures", kind: "list" },
      { key: "differentiators", kind: "list" },
    ],
  },
  {
    id: "market",
    fields: [
      { key: "idealCustomer", kind: "text" },
      { key: "competitors", kind: "list" },
      { key: "positioning", kind: "text" },
    ],
  },
  {
    id: "businessModel",
    fields: [
      { key: "pricing", kind: "text" },
      { key: "revenueStreams", kind: "list" },
      { key: "channels", kind: "list" },
    ],
  },
  {
    id: "goals",
    fields: [
      { key: "northStar", kind: "text" },
      { key: "objectives", kind: "list" },
      { key: "successMetrics", kind: "list" },
    ],
  },
  {
    id: "operations",
    fields: [
      { key: "team", kind: "text" },
      { key: "painPoints", kind: "list" },
    ],
  },
  {
    id: "brand",
    fields: [
      { key: "voice", kind: "text" },
      { key: "links", kind: "list" },
    ],
  },
];

/** A bible shape view that the generic editor can index without `any`. */
type PrdRecord = Record<string, Record<string, string | string[]>>;

export function getField(
  prd: Prd,
  section: string,
  key: string,
): string | string[] {
  return (prd as unknown as PrdRecord)[section]?.[key] ?? "";
}

export function setField(
  prd: Prd,
  section: string,
  key: string,
  value: string | string[],
): Prd {
  const rec = prd as unknown as PrdRecord;
  return {
    ...prd,
    [section]: { ...rec[section], [key]: value },
  } as Prd;
}

/**
 * Clean a model-proposed value before it lands in the bible: drop a leading
 * "New value:" / "Nuevo valor:" style label and any wrapping quotes the model
 * adds despite being told to return the value only.
 */
export function cleanProposedValue(text: string): string {
  let s = text.trim();
  s = s.replace(/^\s*(new value|updated value|nuevo valor|novo valor|valor|value)\s*:\s*/i, "");
  s = s.replace(/^["“”'']+/, "").replace(/["“”'']+$/, "");
  return s.trim();
}

/** True when a single field carries real content. */
export function isFieldFilled(value: string | string[]): boolean {
  return Array.isArray(value)
    ? value.some((v) => v.trim().length > 0)
    : value.trim().length > 0;
}

/** 0–100 share of bible fields that carry content. */
export function computeCompleteness(prd: Prd): number {
  let total = 0;
  let filled = 0;
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      total += 1;
      if (isFieldFilled(getField(prd, section.id, field.key))) filled += 1;
    }
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/** An all-empty bible, used as the fallback before the query resolves. */
export function emptyPrd(): Prd {
  return {
    role: "",
    company: {
      name: "",
      oneLiner: "",
      stage: "",
      industry: "",
      website: "",
      mission: "",
    },
    product: {
      whatItIs: "",
      problemSolved: "",
      keyFeatures: [],
      differentiators: [],
    },
    market: { idealCustomer: "", competitors: [], positioning: "" },
    businessModel: { pricing: "", revenueStreams: [], channels: [] },
    goals: { northStar: "", objectives: [], successMetrics: [] },
    operations: { team: "", painPoints: [] },
    brand: { voice: "", links: [] },
  };
}
