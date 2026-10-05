"use client";

import { useQuery } from "@powersync/react";
import { useEffect, useState } from "react";
import { useSession } from "./context";

export interface ChamberRow {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  hours: string | null;
  schedule: string | null;
  serial_phone: string | null;
  footer_text: string | null;
  logo_data_url: string | null;
  free_report_days: number | null;
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
