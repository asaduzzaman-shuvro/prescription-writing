/** Per-device display prefs (font / padding / gap). Default 1 = current dense UI. Step 0.5. */

export interface UiPrefs {
  font: number;
  padding: number;
  gap: number;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  font: 1,
  padding: 1,
  gap: 1,
};

export const UI_PREF_STEP = 0.5;
export const UI_PREF_MIN = 0.5;
export const UI_PREF_MAX = 2.5;

const STORAGE_KEY = "rx.uiPrefs";

/** Legacy named levels → scale (for one-time migrate). */
const LEGACY_FONT: Record<string, number> = { small: 0.5, default: 1, large: 1.5 };
const LEGACY_SPACE: Record<string, number> = { compact: 0.5, default: 1, roomy: 1.5 };

function clampStep(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const stepped = Math.round(n / UI_PREF_STEP) * UI_PREF_STEP;
  return Math.min(UI_PREF_MAX, Math.max(UI_PREF_MIN, Math.round(stepped * 10) / 10));
}

function parseScale(v: unknown, legacy: Record<string, number>): number {
  if (typeof v === "number") return clampStep(v);
  if (typeof v === "string" && v in legacy) return legacy[v]!;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return clampStep(Number(v));
  return 1;
}

export function loadUiPrefs(): UiPrefs {
  if (typeof window === "undefined") return DEFAULT_UI_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const j = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      font: parseScale(j.font, LEGACY_FONT),
      padding: parseScale(j.padding, LEGACY_SPACE),
      gap: parseScale(j.gap, LEGACY_SPACE),
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

/** Write CSS variables on <html> so Tailwind spacing + root font-size pick them up. */
export function applyUiPrefs(prefs: UiPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--rx-font-scale", String(prefs.font));
  root.style.setProperty("--rx-pad-scale", String(prefs.padding));
  root.style.setProperty("--rx-gap-scale", String(prefs.gap));
}

export function saveUiPrefs(prefs: UiPrefs): void {
  const next = {
    font: clampStep(prefs.font),
    padding: clampStep(prefs.padding),
    gap: clampStep(prefs.gap),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  applyUiPrefs(next);
}

export function bumpUiPref(value: number, delta: number): number {
  return clampStep(value + delta);
}
