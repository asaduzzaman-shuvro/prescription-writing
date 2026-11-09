/**
 * Quick picks for the visit's History box: common past illnesses as doctors write them ("DM, HTN, BA"). Picking one
 * adds it to the free-text history with a comma; picking it again takes it out. Everything else the doctor typed
 * stays as it was.
 */

export interface HistoryPick {
  /** What goes into the history text. */
  code: string;
  /** Shown on hover. */
  name: string;
}

export const HISTORY_PICKS: readonly HistoryPick[] = [
  { code: "DM", name: "Diabetes mellitus" },
  { code: "HTN", name: "Hypertension" },
  { code: "BA", name: "Bronchial asthma" },
  { code: "PTB", name: "Pulmonary tuberculosis" },
  { code: "IHD", name: "Ischaemic heart disease" },
  { code: "COPD", name: "Chronic obstructive pulmonary disease" },
  { code: "CKD", name: "Chronic kidney disease" },
  { code: "CLD", name: "Chronic liver disease" },
  { code: "Stroke", name: "Stroke / CVD" },
  { code: "Hypothyroid", name: "Hypothyroidism" },
  { code: "Epilepsy", name: "Epilepsy" },
  { code: "PUD", name: "Peptic ulcer disease" },
  { code: "Smoker", name: "Smoker" },
  { code: "Allergic rhinitis", name: "Allergic rhinitis" },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when the history already lists the pick as its own item (between commas or on its own line). */
export function historyHas(text: string, code: string): boolean {
  return text.split(/[,\n]/).some((part) => same(part, code));
}

/**
 * Adds the pick to the history, or removes it when it is there. A new pick joins the end of the first line, so picks
 * stay together above anything written on later lines.
 */
export function toggleHistoryPick(text: string, code: string): string {
  const lines = text.split("\n");
  if (historyHas(text, code)) {
    const kept = lines
      .map((line) => {
        const parts = line.split(",");
        const rest = parts.filter((p) => !same(p, code));
        return { was: line, now: rest.length === parts.length ? line : rest.map((p) => p.trim()).filter(Boolean).join(", ") };
      })
      .filter(({ was, now }) => now !== "" || was.trim() === "")
      .map(({ now }) => now);
    return kept.join("\n").trim();
  }
  const first = (lines[0] ?? "").trimEnd().replace(/,\s*$/, "");
  lines[0] = first ? `${first}, ${code}` : code;
  return lines.join("\n");
}
