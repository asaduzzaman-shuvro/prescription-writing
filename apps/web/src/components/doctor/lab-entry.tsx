"use client";

import { LAB_LIMITS, labResult, type LabCultureResult, type LabResult, type LabSir, type LabTest, type LabWho } from "@rx/core";

/** One test's inputs as typed, before they become a stored LabResult. */
export interface RowInput {
  value: string;
  text: string;
  low: string;
  high: string;
  /** Unset: follow the flag (abnormal values print). */
  print?: boolean;
  culture?: LabCultureResult;
}

/** A row nothing was typed in yet (also for a test that reached the catalogue after the editor opened). */
export const EMPTY_ROW: RowInput = { value: "", text: "", low: "", high: "" };

export const FLAG_STYLE: Record<string, string> = { H: "text-red-700", L: "text-blue-700", A: "text-amber-700" };

const toNum = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

/** The inputs for a saved result, to edit it again. */
export function rowFromResult(test: LabTest | undefined, r: LabResult | undefined): RowInput {
  if (!r) return EMPTY_ROW;
  const count = test?.allowRange && r.text !== undefined;
  return {
    value: count ? r.text! : r.value !== undefined ? String(r.value) : "",
    text: count ? "" : (r.text ?? ""),
    low: r.low !== undefined ? String(r.low) : "",
    high: r.high !== undefined ? String(r.high) : "",
    print: r.print,
    ...(r.culture ? { culture: r.culture } : {}),
  };
}

/** A culture as typed → as stored: organisms without a name and drugs without S/I/R are left out. */
function cleanCulture(c: LabCultureResult): LabCultureResult {
  if (!c.growth) return { growth: false, organisms: [] };
  return {
    growth: true,
    organisms: c.organisms
      .filter((o) => o.name.trim())
      .map((o) => ({ name: o.name.trim(), ...(o.count?.trim() ? { count: o.count.trim() } : {}), sensitivity: o.sensitivity.filter((s) => s.sir) })),
  };
}

/** The stored result for a row, or null when nothing was entered. */
export function rowResult(test: LabTest, row: RowInput, who: LabWho, section?: string): LabResult | null {
  const extra = { low: toNum(row.low), high: toNum(row.high), print: row.print, ...(section ? { section } : {}) };
  if (test.kind === "culture") {
    const culture = row.culture && cleanCulture(row.culture);
    // A growth is entered once an organism is named.
    return culture && (!culture.growth || culture.organisms.length) ? labResult(test, { culture, ...extra }, who) : null;
  }
  // Microscopy counts may be written "2-4" or "Plenty".
  if (test.allowRange && row.value.trim()) return labResult(test, { text: row.value, ...extra }, who);
  const value = toNum(row.value);
  if (value === undefined && !row.text.trim()) return null;
  return labResult(test, { value, text: row.text.trim() || undefined, ...extra }, who);
}

/** The value input for a test: a choice, free text with suggestions, a number (or count), or a culture. */
export function LabValueInput({ test, row, onChange, testId }: { test: LabTest; row: RowInput; onChange: (patch: Partial<RowInput>) => void; testId: string }) {
  if (test.kind === "culture") return <CultureInput test={test} value={row.culture} onChange={(culture) => onChange({ culture })} testId={testId} />;
  if (test.kind === "coded" || test.kind === "titre") {
    return (
      <select className="input w-28 py-1" value={row.text} onChange={(e) => onChange({ text: e.target.value })} data-testid={testId}>
        <option value="">—</option>
        {(test.options ?? []).map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  if (test.kind === "text") {
    return (
      <>
        <input className="input w-44 py-1" list={`${testId}-options`} value={row.text} onChange={(e) => onChange({ text: e.target.value })} data-testid={testId} />
        <datalist id={`${testId}-options`}>{(test.options ?? []).map((o) => <option key={o} value={o} />)}</datalist>
      </>
    );
  }
  return (
    <input className="input w-24 py-1" inputMode={test.allowRange ? "text" : "decimal"} placeholder={test.allowRange ? "2-4" : undefined}
      value={row.value} onChange={(e) => onChange({ value: e.target.value })} data-testid={testId} />
  );
}

/** Organisms Bangladeshi labs most often isolate (any other can be typed). */
const ORGANISMS = [
  "Escherichia coli", "Klebsiella pneumoniae", "Pseudomonas aeruginosa", "Staphylococcus aureus", "Enterococcus faecalis", "Proteus mirabilis",
  "Acinetobacter baumannii", "Salmonella Typhi", "Salmonella Paratyphi A", "Streptococcus pyogenes", "Shigella spp.", "Vibrio cholerae", "Candida albicans",
];
const COUNTS = ["10³ CFU/mL", "10⁴ CFU/mL", "10⁵ CFU/mL", ">10⁵ CFU/mL"];
type Organism = LabCultureResult["organisms"][number];

/** No growth, or up to three organisms each with a colony count and an S/I/R sensitivity table. */
export function CultureInput({ test, value, onChange, testId }: { test: LabTest; value: LabCultureResult | undefined; onChange: (c: LabCultureResult | undefined) => void; testId: string }) {
  const drugs = test.antibiotics ?? [];
  const organisms = value?.organisms ?? [];
  const setOrganism = (i: number, patch: Partial<Organism>) => onChange({ growth: true, organisms: organisms.map((o, k) => (k === i ? { ...o, ...patch } : o)) });
  const setSir = (i: number, drug: string, sir: string) => {
    const rest = organisms[i]!.sensitivity.filter((s) => s.drug !== drug);
    setOrganism(i, { sensitivity: sir ? [...rest, { drug, sir: sir as LabSir }].sort((a, b) => drugs.indexOf(a.drug) - drugs.indexOf(b.drug)) : rest });
  };
  return (
    <div className="space-y-2" data-testid={testId}>
      <select className="input w-36 py-1" value={value ? (value.growth ? "growth" : "none") : ""} data-testid={`${testId}-growth`}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "none" ? { growth: false, organisms: [] } : { growth: true, organisms: organisms.length ? organisms : [{ name: "", sensitivity: [] }] })}>
        <option value="">—</option>
        <option value="none">No growth</option>
        <option value="growth">Growth</option>
      </select>
      {value?.growth && organisms.map((o, i) => (
        <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-56 py-1" list="lab-organisms" placeholder="Organism" value={o.name} onChange={(e) => setOrganism(i, { name: e.target.value })} data-testid={`${testId}-organism-${i}`} />
            <input className="input w-32 py-1" list="lab-colony-counts" placeholder="Colony count" value={o.count ?? ""} onChange={(e) => setOrganism(i, { count: e.target.value })} data-testid={`${testId}-count-${i}`} />
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs text-red-700" onClick={() => onChange({ growth: true, organisms: organisms.filter((_, k) => k !== i) })}>Remove organism</button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
            {drugs.map((d) => (
              <label key={d} className="flex items-center justify-between gap-1 text-xs text-slate-600">
                {d}
                <select className="input w-14 py-0 text-xs" value={o.sensitivity.find((s) => s.drug === d)?.sir ?? ""} onChange={(e) => setSir(i, d, e.target.value)} data-testid={`${testId}-sir-${i}-${d}`}>
                  <option value="">–</option>
                  <option>S</option>
                  <option>I</option>
                  <option>R</option>
                </select>
              </label>
            ))}
          </div>
        </div>
      ))}
      {value?.growth && organisms.length < LAB_LIMITS.organisms && (
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange({ growth: true, organisms: [...organisms, { name: "", sensitivity: [] }] })}>+ Organism</button>
      )}
      <datalist id="lab-organisms">{ORGANISMS.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="lab-colony-counts">{COUNTS.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}
