/**
 * A medicine a doctor adds when it is not in the catalogue (`custom_medicine`). The add-medicine form and the
 * sync upload both run `customMedicineProblem` on the same snake_case row, so a row the form accepts is never
 * rejected by the server.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CUSTOM_MEDICINE_MAX_GENERICS = 8;

export type CustomMedicineStatus = "pending" | "approved" | "rejected";

/** `generic_ids` arrives as an array (server) or a JSON string (device SQLite). Null when it is neither. */
export function customMedicineGenericIds(v: unknown): string[] | null {
  if (v === null || v === undefined || v === "") return [];
  let list: unknown = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || !list.every((x) => typeof x === "string")) return null;
  return list as string[];
}

/** First problem with a whole custom medicine row, or null when it can be saved. */
export function customMedicineProblem(r: Record<string, unknown>): string | null {
  const text = (k: string, max: number, label: string): string | null => {
    const v = r[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return `${label} must be text`;
    return v.length > max ? `${label} is too long (max ${max})` : null;
  };
  const filled = (k: string) => typeof r[k] === "string" && (r[k] as string).trim() !== "";
  const uuidOrEmpty = (k: string) => r[k] === undefined || r[k] === null || r[k] === "" || (typeof r[k] === "string" && UUID.test(r[k] as string));

  if (!filled("brand_name")) return "brand name is required";
  const problem =
    text("brand_name", 120, "brand name") ??
    text("strength_text", 60, "strength") ??
    text("generic_text", 200, "generic") ??
    text("company_name", 120, "company");
  if (problem) return problem;
  if (!filled("form_id")) return "form is required";
  if (!uuidOrEmpty("form_id")) return "invalid form";
  if (!uuidOrEmpty("company_id")) return "invalid company";
  const ids = customMedicineGenericIds(r.generic_ids);
  if (!ids || !ids.every((id) => UUID.test(id))) return "invalid generics";
  if (ids.length > CUSTOM_MEDICINE_MAX_GENERICS) return `at most ${CUSTOM_MEDICINE_MAX_GENERICS} generics`;
  if (!ids.length && !filled("generic_text")) return "generic is required";
  return null;
}
