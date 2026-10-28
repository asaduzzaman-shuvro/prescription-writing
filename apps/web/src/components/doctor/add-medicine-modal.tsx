"use client";

import { usePowerSync } from "@powersync/react";
import { customMedicineProblem } from "@rx/core";
import { PillBottle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/lib/doctor/context";
import {
  customMedicineRow,
  dosageForms,
  saveCustomMedicine,
  searchCatalogueNames,
  type CatalogueOption,
  type CustomMedicineInput,
  type MedicineHit,
} from "@/lib/doctor/data";

/** A generic chip: picked from the catalogue (has an id) or typed in when the catalogue lacks it. */
type GenericChip = { id: string | null; name: string };

function inputOf(brand: string, formId: string, strength: string, generics: GenericChip[], company: CatalogueOption | null, companyText: string): CustomMedicineInput {
  return {
    brandName: brand,
    formId,
    strengthText: strength,
    genericText: generics.map((g) => g.name).join(" + "),
    genericIds: generics.flatMap((g) => (g.id ? [g.id] : [])),
    companyId: company?.id ?? null,
    companyName: company ? null : companyText,
  };
}

/** Name search over the synced generic or company list, with a dropdown of matches. */
function CatalogueLookup({
  table,
  value,
  onChange,
  onPick,
  placeholder,
  typedLabel,
  testId,
}: {
  table: "generic" | "company";
  value: string;
  onChange: (v: string) => void;
  onPick: (o: CatalogueOption | { id: null; name: string }) => void;
  placeholder: string;
  /** When set, the list ends with an option to use the typed text as it is. */
  typedLabel?: (q: string) => string;
  testId: string;
}) {
  const db = usePowerSync();
  const [hits, setHits] = useState<CatalogueOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await searchCatalogueNames(db, table, value);
      if (!cancelled) setHits(rows);
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [db, table, value]);

  const typed = value.trim();
  const showTyped = !!typedLabel && typed.length >= 2 && !hits.some((h) => h.name.toLowerCase() === typed.toLowerCase());
  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (hits[0]) onPick(hits[0]);
          else if (showTyped) onPick({ id: null, name: typed });
        }}
      />
      {open && (hits.length > 0 || showTyped) && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-xl" data-testid={`${testId}-results`}>
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-brand-50" onMouseDown={() => onPick(h)}>
                {h.name}
              </button>
            </li>
          ))}
          {showTyped && (
            <li>
              <button type="button" className="w-full px-3 py-1.5 text-left text-slate-600 hover:bg-brand-50" onMouseDown={() => onPick({ id: null, name: typed })}>
                {typedLabel!(typed)}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Adds a medicine that is not in the catalogue. It is saved on this device (works offline), goes straight into the
 * prescription, and only this doctor sees it until the platform admin approves it for everyone.
 */
export function AddMedicineModal({ initialName, onClose, onAdded }: { initialName: string; onClose: () => void; onAdded: (m: MedicineHit) => void }) {
  const db = usePowerSync();
  const { tenantId, userId } = useSession();
  const [forms, setForms] = useState<(CatalogueOption & { short_label: string | null })[]>([]);
  const [brand, setBrand] = useState(initialName);
  const [formId, setFormId] = useState("");
  const [strength, setStrength] = useState("");
  const [generics, setGenerics] = useState<GenericChip[]>([]);
  const [genericQ, setGenericQ] = useState("");
  const [company, setCompany] = useState<CatalogueOption | null>(null);
  const [companyText, setCompanyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const brandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void dosageForms(db).then(setForms);
    brandRef.current?.focus();
  }, [db]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = inputOf(brand, formId, strength, generics, company, companyText);
    const problem = customMedicineProblem(customMedicineRow(input));
    if (problem) {
      setError(problem.charAt(0).toUpperCase() + problem.slice(1));
      return;
    }
    setBusy(true);
    try {
      onAdded(await saveCustomMedicine(db, tenantId, userId, input));
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-[2px] sm:p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-medicine-title"
      data-testid="add-medicine-modal"
      onClick={onClose}
    >
      <form
        className="flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-slate-900/10"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50/90 via-white to-white px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/25" aria-hidden>
            <PillBottle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="add-medicine-title" className="text-base font-bold tracking-tight text-slate-900">
              Add a new medicine
            </h2>
            <p className="text-[11px] leading-snug text-slate-500">Only you will see it until the RxPad team reviews it and adds it for every doctor</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-200/80 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
          <label className="block">
            <span className="label">Brand name *</span>
            <input ref={brandRef} className="input" value={brand} maxLength={120} data-testid="add-med-brand" onChange={(e) => setBrand(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Form *</span>
              <select className="input" value={formId} data-testid="add-med-form" onChange={(e) => setFormId(e.target.value)}>
                <option value="">Choose…</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Strength</span>
              <input className="input" value={strength} maxLength={60} placeholder="e.g. 500 mg" data-testid="add-med-strength" onChange={(e) => setStrength(e.target.value)} />
            </label>
          </div>
          <div>
            <span className="label">Generic *</span>
            {generics.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5" data-testid="add-med-generics">
                {generics.map((g, i) => (
                  <span key={`${g.id ?? "typed"}-${g.name}`} className={`badge ${g.id ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}`} title={g.id ? undefined : "Not in the catalogue; the reviewer will link it"}>
                    {g.name}
                    <button type="button" className="ml-1" aria-label={`Remove ${g.name}`} onClick={() => setGenerics((gs) => gs.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <CatalogueLookup
              table="generic"
              value={genericQ}
              onChange={setGenericQ}
              onPick={(g) => {
                setGenerics((gs) => (gs.some((x) => x.name.toLowerCase() === g.name.toLowerCase()) ? gs : [...gs, g]));
                setGenericQ("");
              }}
              placeholder="Search generic, e.g. paracetamol"
              typedLabel={(q) => `Not listed: use “${q}” as typed`}
              testId="add-med-generic"
            />
          </div>
          <div>
            <span className="label">Company</span>
            {company ? (
              <div className="flex items-center gap-2 text-sm">
                <b>{company.name}</b>
                <button type="button" className="text-xs text-slate-500 underline" onClick={() => setCompany(null)}>
                  change
                </button>
              </div>
            ) : (
              <CatalogueLookup
                table="company"
                value={companyText}
                onChange={setCompanyText}
                onPick={(c) => {
                  if (c.id) setCompany(c);
                  else setCompanyText(c.name);
                }}
                placeholder="Optional"
                testId="add-med-company"
              />
            )}
          </div>
          {error && <p className="alert-danger">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-3 py-2.5 sm:px-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy} data-testid="add-med-save">
            Add to prescription
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
