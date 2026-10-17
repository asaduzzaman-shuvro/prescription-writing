"use client";

import { buildLabCatalogue, LAB_CURATED_PANELS, LAB_CURATED_TESTS, labPanelRow, labTestRow, type LabCatalogue, type LabPanelRow, type LabTestRow } from "@rx/core";
import { useQuery } from "@powersync/react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "./context";

export interface ChamberRow {
  id: string;
  name: string;
  address: string;
  room: string | null;
  phone: string | null;
  hours: string | null;
  schedule: string | null;
  serial_phone: string | null;
  footer_text: string | null;
  logo_data_url: string | null;
  free_report_days: number | null;
  report_fee: number | null;
  print_settings: string | null;
  doctor_user_id: string | null;
  is_active: number | null;
}

/** Chambers of this tenant and the one currently selected on this device. */
export function useChambers() {
  const { userId } = useSession();
  const { data } = useQuery<ChamberRow>(
    "SELECT * FROM chamber WHERE is_active = 1 OR is_active IS NULL ORDER BY (doctor_user_id = ?) DESC, name",
    [userId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelectedId(localStorage.getItem("rx.chamber"));
    } catch {
      // storage unavailable
    }
  }, []);
  const current = data.find((c) => c.id === selectedId) ?? data[0] ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem("rx.chamber", id);
    } catch {
      // storage unavailable
    }
  };
  return { chambers: data, current, select };
}

export interface DoctorRow {
  id: string;
  name_en: string;
  specialty_code: string;
}

export function useDoctors() {
  const { data } = useQuery<DoctorRow>("SELECT id, name_en, specialty_code FROM doctor_profile ORDER BY name_en");
  return data;
}

export function useMyProfile() {
  const { userId } = useSession();
  const { data } = useQuery<{ id: string; name_en: string; specialty_code: string; bmdc_expiry: string | null; bmdc_verified_at: string | null; signature_data_url: string | null }>(
    "SELECT id, name_en, specialty_code, bmdc_expiry, bmdc_verified_at, signature_data_url FROM doctor_profile WHERE id = ?",
    [userId],
  );
  return data[0] ?? null;
}

interface LabCatalogueSqlRow {
  id: string;
  tenant_id: string | null;
  name: string | null;
  department: string | null;
  sort_order: number | null;
  is_active: number | null;
  spec: string | null;
}

/** The curated catalogue as rows: what a device uses until the platform's rows have synced. */
const CURATED_ROWS = {
  tests: LAB_CURATED_TESTS.map((t, i) => labTestRow(t, i)),
  panels: LAB_CURATED_PANELS.map((p, i) => labPanelRow(p, i)),
};

export interface LabCatalogueRows {
  tests: LabTestRow[];
  panels: LabPanelRow[];
}

/** The lab catalogue's rows on this device, platform and clinic (the curated ones until the platform's have synced). */
export function useLabCatalogueRows(): LabCatalogueRows {
  const { data: tests } = useQuery<LabCatalogueSqlRow & { code: string; short: string | null; unit: string | null; kind: string | null }>("SELECT * FROM lab_test");
  const { data: panels } = useQuery<LabCatalogueSqlRow & { key: string }>("SELECT * FROM lab_panel");
  return useMemo(() => {
    const row = (r: LabCatalogueSqlRow) => ({ tenantId: r.tenant_id, name: r.name, department: r.department, sortOrder: r.sort_order, isActive: r.is_active !== 0, spec: r.spec });
    const synced = tests.some((t) => !t.tenant_id);
    return {
      tests: [...(synced ? [] : CURATED_ROWS.tests), ...tests.map((t) => ({ ...row(t), code: t.code, short: t.short, unit: t.unit, kind: t.kind }))],
      panels: [...(synced ? [] : CURATED_ROWS.panels), ...panels.map((p) => ({ ...row(p), key: p.key }))],
    };
  }, [tests, panels]);
}

/** The lab catalogue this clinic uses: the platform's tests with the clinic's own changes laid over them. */
export function useLabCatalogue(): LabCatalogue {
  const rows = useLabCatalogueRows();
  return useMemo(() => buildLabCatalogue(rows), [rows]);
}
