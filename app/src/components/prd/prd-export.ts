import type { Prd } from "@houston-ai/engine-client";

/** Exported bible file shape — what another person imports. */
export interface BibleExport {
  version: 1;
  name: string;
  prd: Prd;
}

/** Parse a `.bible.json` file someone shared. Throws on a malformed file. */
export function parseBibleExport(text: string): BibleExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid bible file");
  }
  const obj = data as Partial<BibleExport> | null;
  if (!obj || typeof obj !== "object" || !obj.prd || typeof obj.prd !== "object") {
    throw new Error("Not a valid bible file");
  }
  return {
    version: 1,
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name : "Imported bible",
    prd: obj.prd as Prd,
  };
}

/**
 * Download a bible as a JSON file so it can be shared and imported elsewhere.
 * Pure DOM (blob + anchor); no engine round-trip.
 */
export function downloadBible(name: string | undefined, prd: Prd) {
  const safe = (name ?? "company-bible").trim() || "company-bible";
  const payload: BibleExport = { version: 1, name: safe, prd };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe.replace(/\s+/g, "-").toLowerCase()}.bible.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
