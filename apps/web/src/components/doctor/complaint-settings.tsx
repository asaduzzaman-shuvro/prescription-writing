"use client";

import { DOCTOR_COMPLAINT_MAX } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { removeDoctorComplaint, saveDoctorComplaint, type DoctorComplaintRow } from "@/lib/doctor/data";
import { useDoctorComplaints, useMyProfile } from "@/lib/doctor/hooks";
import { Link } from "@/lib/doctor/router";

interface SharedComplaint {
  id: string;
  name: string;
  name_bn: string | null;
}

/** Where one of the doctor's lines stands: only they see it until the platform admin shares it with every doctor. */
export function DoctorComplaintBadge({ row }: { row: Pick<DoctorComplaintRow, "status" | "review_note"> }) {
  if (row.status === "approved") return <span className="badge shrink-0 bg-emerald-50 text-emerald-700" data-testid="cc-badge">Shared with all doctors</span>;
  if (row.status === "rejected")
    return (
      <span className="badge shrink-0 bg-slate-100 text-slate-600" title={row.review_note ?? undefined} data-testid="cc-badge">
        Private · not shared{row.review_note ? ` — ${row.review_note}` : ""}
      </span>
    );
  return <span className="badge shrink-0 bg-amber-50 text-amber-700" data-testid="cc-badge">Private · pending review</span>;
}

/**
 * #/settings/complaints: the doctor's own C/C lines ("Fever for 3 days"), and their edits of shared lines. Only the
 * doctor sees them; each one also goes to the platform admin, who may share it with every doctor.
 */
export function ComplaintSettingsScreen() {
  const session = useSession();
  return (
    <div className="space-y-2.5" data-testid="complaint-settings">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn-ghost">← Settings</Link>
        <h1 className="text-lg font-semibold">Chief complaints (C/C)</h1>
      </div>
      {session.tenantRole === "doctor" ? <ComplaintEditor /> : <p className="text-sm text-slate-600">Only a doctor can keep their own C/C lines.</p>}
    </div>
  );
}

type Editing = { id?: string; replaces?: SharedComplaint; name: string; nameBn: string };

function ComplaintEditor() {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const mine = useDoctorComplaints();
  const { data: shared } = useQuery<SharedComplaint>(
    `SELECT id, name, name_bn FROM complaint WHERE specialty_code IS NULL OR specialty_code = ?
      ORDER BY specialty_code IS NULL, sort_order, name`,
    [profile?.specialty_code ?? ""],
  );
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const overrides = useMemo(() => new Map(mine.filter((m) => m.replaces_complaint_id).map((m) => [m.replaces_complaint_id!, m])), [mine]);
  const own = mine.filter((m) => !m.replaces_complaint_id);
  // A shared line the doctor already has as their own (e.g. their approved line) is listed once, under theirs.
  const ownNames = useMemo(() => new Set(own.map((m) => m.name.toLowerCase())), [own]);
  const q = filter.trim().toLowerCase();
  const matches = (name: string, bn: string | null) => !q || name.toLowerCase().includes(q) || (bn ?? "").toLowerCase().includes(q);
  const ownShown = own.filter((m) => matches(m.name, m.name_bn));
  const sharedShown = shared.filter((c) => !ownNames.has(c.name.toLowerCase()) && (matches(c.name, c.name_bn) || matches(overrides.get(c.id)?.name ?? "", null)));

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(undefined);
    try {
      await saveDoctorComplaint(db, session.tenantId, session.userId, {
        id: editing.id,
        name: editing.name,
        nameBn: editing.nameBn,
        replacesComplaintId: editing.replaces?.id ?? null,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not saved");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(undefined);
    await removeDoctorComplaint(db, id);
    if (editing?.id === id) setEditing(null);
  }

  const form = editing && (
    <div className="space-y-1.5 rounded-md border border-brand-200 bg-brand-50/30 p-2" data-testid="cc-form">
      {editing.replaces && (
        <p className="text-[11px] text-slate-500">
          Your version of the shared line “{editing.replaces.name}”. Other doctors still see the original.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <input
          className="input min-w-[12rem] flex-1 py-1 text-sm"
          autoFocus
          maxLength={DOCTOR_COMPLAINT_MAX}
          placeholder="Fever for 3 days"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          data-testid="cc-form-name"
        />
        <input
          className="input min-w-[10rem] flex-1 py-1 text-sm"
          maxLength={DOCTOR_COMPLAINT_MAX}
          placeholder="বাংলা (optional)"
          value={editing.nameBn}
          onChange={(e) => setEditing({ ...editing, nameBn: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          data-testid="cc-form-name-bn"
        />
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="btn-primary py-1 text-sm" disabled={busy} onClick={() => void save()} data-testid="cc-form-save">Save</button>
        <button type="button" className="btn-ghost py-1 text-sm" onClick={() => { setEditing(null); setError(undefined); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-500">
        Your lines and edits are suggested only to you while writing C/C. The platform admin may also share them with all doctors.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input className="input max-w-xs py-1 text-sm" placeholder="Find a complaint…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="cc-filter" />
        <button type="button" className="btn-secondary py-1 text-sm" onClick={() => setEditing({ name: filter.trim(), nameBn: "" })} data-testid="cc-add">+ Add line</button>
      </div>
      {error && <p className="text-sm text-red-700" data-testid="cc-error">{error}</p>}
      {editing && !editing.id && !editing.replaces && form}

      <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <h2 className="mb-1 text-xs font-semibold text-slate-900">My lines</h2>
        {ownShown.length === 0 ? (
          <p className="text-xs text-slate-500">{own.length ? "None match." : "None yet. Add one here, or pick “Save to my C/C list” while writing a prescription."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ownShown.map((m) => (
              <li key={m.id} className="py-1.5" data-testid={`cc-mine-${m.name}`}>
                {editing?.id === m.id ? (
                  form
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="flex-1">
                      {m.name} {m.name_bn && <span className="text-xs text-slate-400">{m.name_bn}</span>}
                    </span>
                    <DoctorComplaintBadge row={m} />
                    <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => setEditing({ id: m.id, name: m.name, nameBn: m.name_bn ?? "" })}>Edit</button>
                    <button type="button" className="btn-ghost h-7 px-2 text-xs text-red-700" onClick={() => void remove(m.id)}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <h2 className="mb-1 text-xs font-semibold text-slate-900">Shared lines</h2>
        <p className="mb-1 text-[11px] text-slate-500">Edit one to make your own version, e.g. “Ear discharge” → “Ear discharge for 7 days”.</p>
        <ul className="divide-y divide-slate-100">
          {sharedShown.slice(0, 150).map((c) => {
            const o = overrides.get(c.id);
            return (
              <li key={c.id} className="py-1.5" data-testid={`cc-shared-${c.name}`}>
                {editing?.replaces?.id === c.id ? (
                  form
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="flex-1">
                      {o ? (
                        <>
                          {o.name} <span className="text-xs text-slate-400 line-through">{c.name}</span>
                        </>
                      ) : (
                        <>
                          {c.name} {c.name_bn && <span className="text-xs text-slate-400">{c.name_bn}</span>}
                        </>
                      )}
                    </span>
                    {o && <DoctorComplaintBadge row={o} />}
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 text-xs"
                      onClick={() => setEditing({ id: o?.id, replaces: c, name: o?.name ?? c.name, nameBn: o ? o.name_bn ?? "" : c.name_bn ?? "" })}
                      data-testid={`cc-shared-edit-${c.name}`}
                    >
                      Edit
                    </button>
                    {o && <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => void remove(o.id)}>Revert</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {sharedShown.length > 150 && <p className="pt-1 text-[11px] text-slate-500">Showing 150 of {sharedShown.length}. Type to find more.</p>}
      </section>
    </div>
  );
}
