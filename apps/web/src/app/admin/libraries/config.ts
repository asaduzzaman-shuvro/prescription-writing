import { s } from "@rx/db";

export const LIBRARIES = {
  complaints: { title: "Chief complaints", table: s.complaint, fields: [{ key: "name", label: "Complaint (English)" }, { key: "nameBn", label: "বাংলা" }] },
  investigations: { title: "Investigations", table: s.investigation, fields: [{ key: "name", label: "Investigation" }, { key: "category", label: "Category" }] },
  diagnoses: { title: "Diagnoses", table: s.diagnosis, fields: [{ key: "name", label: "Diagnosis" }, { key: "icd10", label: "ICD-10" }, { key: "icd11", label: "ICD-11" }] },
  advice: { title: "Advice snippets", table: s.adviceSnippet, fields: [{ key: "textBn", label: "উপদেশ (বাংলা)" }, { key: "textEn", label: "English" }, { key: "category", label: "Category" }] },
  instructions: { title: "Medicine instructions", table: s.instructionSnippet, fields: [{ key: "textBn", label: "নির্দেশনা (বাংলা)" }, { key: "textEn", label: "English" }] },
} as const;

export type LibraryKind = keyof typeof LIBRARIES;
export const isLibraryKind = (k: string): k is LibraryKind => k in LIBRARIES;
