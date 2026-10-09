"use client";

import {
  buildLabCatalogue,
  cleanLabPanelSpec,
  customLabCode,
  LAB_DEPARTMENTS,
  labRefText,
  labTestOverride,
  type LabDepartment,
  type LabPanel,
  type LabRange,
  type LabSignatory,
  type LabTest,
  type LabTestRow,
} from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { LAB_PROFILE_LIMITS, saveLabCatalogueRow, saveLabProfile } from "@/lib/doctor/data";
import { useLabCatalogue, useLabCatalogueRows } from "@/lib/doctor/hooks";
import { Link } from "@/lib/doctor/router";
import { parseJson } from "@/lib/doctor/util";

/**
 * #/settings/lab: how the clinic's lab reports are headed and signed, and its changes to the test catalogue
 * (ranges, units, hidden tests, its own tests). The platform's catalogue itself is never changed from here.
 */
export function LabSettingsScreen() {
  const session = useSession();
  return (
    <div className="space-y-5" data-testid="lab-settings">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn-ghost">← Settings</Link>
        <h1 className="text-xl font-semibold">Lab settings</h1>
      </div>
      {session.tenantRole === "assistant" ? (
        <p className="text-sm text-slate-600">Only a doctor or the clinic admin can change the lab settings.</p>
      ) : (
        <>
          <LabProfileForm />
          <LabCatalogueEditor />
        </>
      )}
    </div>
  );
}

const MAX_SIGNATORIES = 4;

function LabProfileForm() {
  const db = usePowerSync();
  const session = useSession();
  const { data } = useQuery<{ lab_name: string | null; address: string | null; phone: string | null; logo_data_url: string | null; signatories: string | null; footer_text: string | null }>(
    "SELECT lab_name, address, phone, logo_data_url, signatories, footer_text FROM lab_profile WHERE id = ?",
    [session.tenantId],
  );
  const row = data[0];
  const [labName, setLabName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [footer, setFooter] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [signatories, setSignatories] = useState<LabSignatory[]>([]);
  const [status, setStatus] = useState<{ ok?: boolean; error?: string }>({});

  useEffect(() => {
    if (!row) return;
    setLabName(row.lab_name ?? "");
    setAddress(row.address ?? "");
    setPhone(row.phone ?? "");
    setFooter(row.footer_text ?? "");
    setLogo(row.logo_data_url);
    setSignatories(parseJson<LabSignatory[]>(row.signatories, []));
  }, [row?.lab_name, row?.address, row?.phone, row?.footer_text, row?.logo_data_url, row?.signatories]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSignatory = (i: number, patch: Partial<LabSignatory>) => setSignatories((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 300_000) return setStatus({ error: "Please use a logo image under 300 KB." });
    setLogo(await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    }));
  }

  async function save() {
    try {
      await saveLabProfile(db, session.tenantId, { labName, address, phone, logoDataUrl: logo, signatories, footerText: footer });
      setStatus({ ok: true });
    } catch (e) {
      setStatus({ error: (e as Error).message });
    }
  }

  return (
    <section className="card space-y-3 p-4" data-testid="lab-profile">
      <div>
        <h2 className="font-semibold">Report heading</h2>
        <p className="text-xs text-slate-500">Printed at the top of the clinic&apos;s lab reports. Left blank, the chamber&apos;s name and address are used.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm"><span className="label">Lab name</span><input className="input" value={labName} onChange={(e) => setLabName(e.target.value)} maxLength={120} data-testid="lab-profile-name" /></label>
        <label className="text-sm"><span className="label">Address</span><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} data-testid="lab-profile-address" /></label>
        <label className="text-sm"><span className="label">Phone</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={60} data-testid="lab-profile-phone" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="label mb-0">Logo</span>
        {logo && <img src={logo} alt="Lab logo" className="h-10 border border-slate-200 bg-white" />}
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} className="text-xs" />
        {logo && <button className="btn-ghost text-xs" onClick={() => setLogo(null)}>Remove</button>}
      </div>
      <div className="space-y-2">
        <span className="label">Signatories</span>
        <p className="text-xs text-slate-500">
          Printed at the foot of every report beside &ldquo;Prepared by&rdquo;. Reports print as soon as they are entered, without anyone checking
          them first, so list only people who accept that.
        </p>
        {signatories.map((x, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className="input w-52" placeholder="Name" value={x.name} onChange={(e) => setSignatory(i, { name: e.target.value })} maxLength={80} data-testid={`lab-signatory-name-${i}`} />
            <input className="input w-60" placeholder="Degrees (MBBS, M.Phil)" value={x.degrees ?? ""} onChange={(e) => setSignatory(i, { degrees: e.target.value })} maxLength={120} data-testid={`lab-signatory-degrees-${i}`} />
            <input className="input w-52" placeholder="Title (Consultant pathologist)" value={x.title ?? ""} onChange={(e) => setSignatory(i, { title: e.target.value })} maxLength={120} data-testid={`lab-signatory-title-${i}`} />
            <button className="btn-ghost px-2 py-0.5 text-xs text-red-700" onClick={() => setSignatories((l) => l.filter((_, k) => k !== i))}>Remove signatory</button>
          </div>
        ))}
        {signatories.length < MAX_SIGNATORIES && (
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setSignatories((l) => [...l, { name: "" }])} data-testid="lab-signatory-add">+ Signatory</button>
        )}
      </div>
      <label className="block text-sm"><span className="label">Footer</span>
        <input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={300} placeholder="e.g. Reports are to be correlated clinically." data-testid="lab-profile-footer" />
      </label>
      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={save} data-testid="lab-profile-save">Save heading</button>
        {status.ok && <span className="text-sm text-green-700">Saved</span>}
        {status.error && <span className="text-sm text-red-700">{status.error}</span>}
      </div>
      {logo && logo.length > LAB_PROFILE_LIMITS.logoChars && <p className="text-xs text-red-700">The logo is too large to sync.</p>}
    </section>
  );
}

const toNum = (s: string) => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};
const rangeOf = (low: string, high: string): LabRange | undefined => {
  const r: LabRange = {};
  if (toNum(low) !== undefined) r.low = toNum(low);
  if (toNum(high) !== undefined) r.high = toNum(high);
  return r.low !== undefined || r.high !== undefined ? r : undefined;
};
const numText = (n: number | undefined) => (n === undefined ? "" : String(n));
const listOf = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const deptName = (d: string) => LAB_DEPARTMENTS.find((x) => x.id === d)?.name ?? d;

/** The catalogue as the clinic sees it, with what it changed: hide and show, edit, add its own tests. */
function LabCatalogueEditor() {
  const db = usePowerSync();
  const session = useSession();
  const rows = useLabCatalogueRows();
  const cat = useLabCatalogue();
  // The platform's catalogue alone: what a clinic row is compared against, and the panels before the clinic hid any.
  const platform = useMemo(() => buildLabCatalogue({ tests: rows.tests.filter((r) => !r.tenantId), panels: rows.panels.filter((r) => !r.tenantId) }), [rows]);
  const clinicTests = useMemo(() => new Map(rows.tests.filter((r) => r.tenantId).map((r) => [r.code, r])), [rows]);
  const clinicPanels = useMemo(() => new Map(rows.panels.filter((r) => r.tenantId).map((r) => [r.key, r])), [rows]);
  const [filter, setFilter] = useState("");
  const [dept, setDept] = useState<"" | LabDepartment>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = filter.trim().toLowerCase();
  const tests = Object.values(cat.byCode).filter(
    (t) => (!dept || t.department === dept) && (!words || `${t.name} ${t.short} ${t.code} ${(t.aliases ?? []).join(" ")}`.toLowerCase().includes(words)),
  );
  // Panels the clinic hid are gone from its catalogue; list them from the platform's so they can come back.
  const panels = [...cat.panels, ...platform.panels.filter((p) => !cat.panelById[p.id])].filter((p) => !dept || p.department === dept);

  const run = (fn: () => Promise<void>) => fn().then(() => setError(null), (e: Error) => setError(e.message));
  const setTestShown = (code: string, shown: boolean) => run(() => saveLabCatalogueRow(db, session.tenantId, "lab_test", code, { is_active: shown }));
  const setPanelShown = (key: string, shown: boolean) => run(() => saveLabCatalogueRow(db, session.tenantId, "lab_panel", key, { is_active: shown }));

  return (
    <section className="card space-y-3 p-4" data-testid="lab-catalogue-settings">
      <div>
        <h2 className="font-semibold">Tests</h2>
        <p className="text-xs text-slate-500">
          Change a test&apos;s name, unit or normal range to match your lab&apos;s machine, hide tests you don&apos;t do, or add your own. Reports
          already saved keep the name and range they were printed with.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs py-1 text-sm" placeholder="Find a test…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="lab-settings-filter" />
        <select className="input w-auto py-1 text-sm" value={dept} onChange={(e) => setDept(e.target.value as LabDepartment | "")} data-testid="lab-settings-department">
          <option value="">All departments</option>
          {LAB_DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn-secondary py-1 text-sm" onClick={() => setAdding(true)} data-testid="lab-settings-add">+ Add a test</button>
      </div>
      {error && <p className="text-sm text-red-700" data-testid="lab-settings-error">{error}</p>}
      {adding && <CustomTestForm cat={cat} platformPanels={platform.panelById} clinicPanels={clinicPanels} clinicTests={clinicTests} onDone={() => setAdding(false)} />}
      <div className="overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Test</th><th>Department</th><th>Unit</th><th>Normal range</th><th>Status</th><th /></tr></thead>
          <tbody>
            {tests.map((t) => {
              const own = clinicTests.get(t.code);
              const hidden = cat.hidden.has(t.code);
              const base = platform.byCode[t.code];
              const status = hidden ? "Hidden" : !base ? "Clinic's own" : own && (own.name || own.short || own.unit || Object.keys(cleanSpec(own)).length) ? "Changed" : "";
              return [
                <tr key={t.code} className={hidden ? "opacity-50" : ""} data-testid={`lab-settings-test-${t.code}`}>
                  <td><span className="font-medium">{t.name}</span> <span className="text-xs text-slate-500">{t.short} · {t.code}</span></td>
                  <td className="text-xs">{deptName(t.department)}</td>
                  <td>{t.unit}</td>
                  <td className="text-xs" data-testid={`lab-settings-ref-${t.code}`}>{labRefText(t, null)}</td>
                  <td className="text-xs" data-testid={`lab-settings-status-${t.code}`}>{status}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setEditing(editing === t.code ? null : t.code)} data-testid={`lab-settings-edit-${t.code}`}>Edit</button>
                    <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setTestShown(t.code, hidden)} data-testid={`lab-settings-hide-${t.code}`}>{hidden ? "Show" : "Hide"}</button>
                  </td>
                </tr>,
                editing === t.code && (
                  <tr key={`${t.code}-edit`}>
                    <td colSpan={6} className="bg-slate-50">
                      <TestEditor test={t} platformTest={base} clinicRow={own} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
        {!tests.length && <p className="p-2 text-sm text-slate-500">No test matches.</p>}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Panels</h3>
        <p className="mb-2 text-xs text-slate-500">A hidden panel is no longer offered when taking a patient&apos;s tests.</p>
        <div className="flex flex-wrap gap-1.5">
          {panels.map((p) => {
            const hidden = !cat.panelById[p.id];
            return (
              <button key={p.id} type="button" onClick={() => setPanelShown(p.id, hidden)} data-testid={`lab-settings-panel-${p.id}`}
                title={hidden ? "Hidden: click to offer it again" : "Click to hide"}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${hidden ? "border-slate-200 text-slate-400 line-through" : "border-slate-300 hover:bg-slate-50"}`}>
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const cleanSpec = (r: LabTestRow) => {
  const spec = typeof r.spec === "string" ? parseJson<Record<string, unknown>>(r.spec, {}) : ((r.spec ?? {}) as Record<string, unknown>);
  return spec && typeof spec === "object" ? spec : {};
};

/** One test's name, unit and normal range as the clinic prints them. */
function TestEditor({ test, platformTest, clinicRow, onDone }: { test: LabTest; platformTest: LabTest | undefined; clinicRow: LabTestRow | undefined; onDone: () => void }) {
  const db = usePowerSync();
  const session = useSession();
  const r = test.range;
  const [name, setName] = useState(test.name);
  const [short, setShort] = useState(test.short);
  const [unit, setUnit] = useState(test.unit);
  const [low, setLow] = useState(numText(r?.low));
  const [high, setHigh] = useState(numText(r?.high));
  const [mLow, setMLow] = useState(numText(r?.male?.low));
  const [mHigh, setMHigh] = useState(numText(r?.male?.high));
  const [fLow, setFLow] = useState(numText(r?.female?.low));
  const [fHigh, setFHigh] = useState(numText(r?.female?.high));
  const [refText, setRefText] = useState(test.refText ?? "");
  const [options, setOptions] = useState((test.options ?? []).join(", "));
  const [normal, setNormal] = useState((test.normal ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const numeric = test.kind === "numeric";
  const listed = test.kind === "coded" || test.kind === "text";

  async function save() {
    if (!name.trim() || !short.trim()) return setError("A test needs a name and a short name.");
    for (const [lo, hi] of [[low, high], [mLow, mHigh], [fLow, fHigh]] as const) {
      if ((lo.trim() && toNum(lo) === undefined) || (hi.trim() && toNum(hi) === undefined)) return setError("Ranges must be numbers.");
      if (toNum(lo) !== undefined && toNum(hi) !== undefined && toNum(lo)! > toNum(hi)!) return setError("A range's low is above its high.");
    }
    const male = rangeOf(mLow, mHigh), female = rangeOf(fLow, fHigh);
    // The age bands aren't edited here; they are written back as they were.
    const range = numeric ? { ...rangeOf(low, high), ...(male ? { male } : {}), ...(female ? { female } : {}), ...(r?.bands ? { bands: r.bands } : {}) } : test.range;
    const cols = labTestOverride(platformTest, clinicRow?.spec, {
      name: name.trim(), short: short.trim(), unit: unit.trim(), kind: test.kind, department: test.department,
      range, refText: refText.trim(), options: listed ? listOf(options) : test.options, normal: listed ? listOf(normal) : test.normal,
    });
    try {
      await saveLabCatalogueRow(db, session.tenantId, "lab_test", test.code, cols);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reset() {
    try {
      await saveLabCatalogueRow(db, session.tenantId, "lab_test", test.code, { name: null, short: null, unit: null, spec: {} });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, id: string, w = "w-24") => (
    <label className="text-xs text-slate-500">
      <span className="block">{label}</span>
      <input className={`input py-1 ${w}`} value={value} onChange={(e) => set(e.target.value)} data-testid={`lab-edit-${id}`} />
    </label>
  );
  return (
    <div className="space-y-2 p-2" data-testid="lab-test-editor">
      <div className="flex flex-wrap gap-2">
        {field("Name", name, setName, "name", "w-60")}
        {field("Short name (printed)", short, setShort, "short", "w-32")}
        {field("Unit", unit, setUnit, "unit", "w-28")}
      </div>
      {numeric && (
        <div className="flex flex-wrap items-end gap-2">
          {field("Low", low, setLow, "low")}
          {field("High", high, setHigh, "high")}
          {field("Male low", mLow, setMLow, "male-low")}
          {field("Male high", mHigh, setMHigh, "male-high")}
          {field("Female low", fLow, setFLow, "female-low")}
          {field("Female high", fHigh, setFHigh, "female-high")}
          {r?.bands?.length ? <span className="text-xs text-slate-500">Children&apos;s ranges by age are kept.</span> : null}
        </div>
      )}
      {listed && (
        <div className="flex flex-wrap gap-2">
          {field("Choices (comma separated)", options, setOptions, "options", "w-96")}
          {field("Normal (comma separated)", normal, setNormal, "normal", "w-60")}
        </div>
      )}
      <div>{field("Printed range (instead of the numbers above; blank prints the numbers)", refText, setRefText, "ref-text", "w-[32rem] max-w-full")}</div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary py-1 text-sm" onClick={save} data-testid="lab-edit-save">Save</button>
        <button className="btn-ghost py-1 text-sm" onClick={onDone}>Cancel</button>
        {platformTest && clinicRow && <button className="btn-ghost py-1 text-sm" onClick={reset} data-testid="lab-edit-reset">Use the standard values</button>}
      </div>
    </div>
  );
}

const OWN_PANEL = "";

/** The clinic's own test, reported on its own or as part of a panel. */
function CustomTestForm({ cat, platformPanels, clinicPanels, clinicTests, onDone }: {
  cat: ReturnType<typeof useLabCatalogue>;
  platformPanels: Record<string, LabPanel>;
  clinicPanels: Map<string, { spec?: unknown }>;
  clinicTests: Map<string, LabTestRow>;
  onDone: () => void;
}) {
  const db = usePowerSync();
  const session = useSession();
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [unit, setUnit] = useState("");
  const [kind, setKind] = useState<"numeric" | "coded" | "text">("numeric");
  const [department, setDepartment] = useState<LabDepartment>("biochemistry");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [options, setOptions] = useState("");
  const [normal, setNormal] = useState("");
  const [panel, setPanel] = useState(OWN_PANEL);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !short.trim()) return setError("A test needs a name and a short name.");
    if ((low.trim() && toNum(low) === undefined) || (high.trim() && toNum(high) === undefined)) return setError("Ranges must be numbers.");
    if (kind === "coded" && !listOf(options).length) return setError("List the choices, separated by commas.");
    const code = customLabCode(name, (c) => Boolean(cat.byCode[c]) || clinicTests.has(c) || clinicPanels.has(c));
    const range = kind === "numeric" ? rangeOf(low, high) : undefined;
    const cols = labTestOverride(undefined, {}, {
      name: name.trim(), short: short.trim(), unit: unit.trim(), kind, department,
      ...(range ? { range } : {}), ...(kind !== "numeric" && listOf(options).length ? { options: listOf(options) } : {}), ...(kind !== "numeric" && listOf(normal).length ? { normal: listOf(normal) } : {}),
    });
    const sortOrder = 100_000 + clinicTests.size;
    try {
      await saveLabCatalogueRow(db, session.tenantId, "lab_test", code, { ...cols, sort_order: sortOrder, is_active: true });
      if (panel === OWN_PANEL) {
        await saveLabCatalogueRow(db, session.tenantId, "lab_panel", code, { name: name.trim(), department, sort_order: sortOrder, is_active: true, spec: { sections: [{ tests: [code] }] } });
      } else {
        // Into the panel's last section, keeping its other sections; the clinic's earlier additions stay.
        const spec = cleanLabPanelSpec(clinicPanels.get(panel)?.spec);
        const base = platformPanels[panel] ?? cat.panelById[panel];
        const sections = spec.sections ?? base?.sections ?? [{ tests: base?.tests ?? [] }];
        const last = sections.length - 1;
        await saveLabCatalogueRow(db, session.tenantId, "lab_panel", panel, { spec: { ...spec, sections: sections.map((s, i) => (i === last ? { ...s, tests: [...s.tests, code] } : s)) } });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const input = (label: string, value: string, set: (v: string) => void, id: string, w = "w-28") => (
    <label className="text-xs text-slate-500">
      <span className="block">{label}</span>
      <input className={`input py-1 ${w}`} value={value} onChange={(e) => set(e.target.value)} data-testid={`lab-new-${id}`} />
    </label>
  );
  return (
    <div className="space-y-2 rounded border border-slate-200 p-3" data-testid="lab-new-test">
      <h3 className="text-sm font-semibold">Add a test</h3>
      <div className="flex flex-wrap items-end gap-2">
        {input("Name", name, setName, "name", "w-60")}
        {input("Short name (printed)", short, setShort, "short", "w-32")}
        {input("Unit", unit, setUnit, "unit")}
        <label className="text-xs text-slate-500"><span className="block">Result</span>
          <select className="input w-auto py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} data-testid="lab-new-kind">
            <option value="numeric">A number</option><option value="coded">One of a list</option><option value="text">Text</option>
          </select>
        </label>
        <label className="text-xs text-slate-500"><span className="block">Department</span>
          <select className="input w-auto py-1" value={department} onChange={(e) => setDepartment(e.target.value as LabDepartment)} data-testid="lab-new-department">
            {LAB_DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {kind === "numeric" ? (
          <>{input("Normal low", low, setLow, "low")}{input("Normal high", high, setHigh, "high")}</>
        ) : (
          <>{input("Choices (comma separated)", options, setOptions, "options", "w-80")}{input("Normal (comma separated)", normal, setNormal, "normal", "w-60")}</>
        )}
        <label className="text-xs text-slate-500"><span className="block">Report it</span>
          <select className="input w-auto py-1" value={panel} onChange={(e) => setPanel(e.target.value)} data-testid="lab-new-panel">
            <option value={OWN_PANEL}>On its own</option>
            {cat.panels.filter((p) => p.department === department && p.layout !== "culture").map((p) => <option key={p.id} value={p.id}>In {p.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary py-1 text-sm" onClick={save} data-testid="lab-new-save">Add test</button>
        <button className="btn-ghost py-1 text-sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
