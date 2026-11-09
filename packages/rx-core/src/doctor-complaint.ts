/**
 * A doctor's own chief-complaint line (`doctor_complaint`), e.g. "Fever for 3 days". Only its owner sees it; a
 * platform admin may share it with every doctor. The C/C settings screen and the sync upload both run
 * `doctorComplaintProblem` on the same snake_case row, so a line the screen accepts is never rejected by the server.
 */
import { derivedUuid } from "./lab-tests";

export const DOCTOR_COMPLAINT_MAX = 120;

export type DoctorComplaintStatus = "pending" | "approved" | "rejected";

/**
 * The id of a doctor's edit of a shared complaint. It is derived, so two devices that edit the same shared line
 * offline write one row (the later upload wins) instead of two the server would refuse.
 */
export function doctorComplaintOverrideId(userId: string, complaintId: string): string {
  return derivedUuid(`doctor_complaint:${userId}:${complaintId}`);
}

/** First problem with a whole doctor_complaint row, or null when it can be saved. */
export function doctorComplaintProblem(r: Record<string, unknown>): string | null {
  const text = (k: string, label: string): string | null => {
    const v = r[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return `${label} must be text`;
    return v.length > DOCTOR_COMPLAINT_MAX ? `${label} is too long (max ${DOCTOR_COMPLAINT_MAX})` : null;
  };
  if (typeof r.name !== "string" || r.name.trim() === "") return "complaint is required";
  return text("name", "complaint") ?? text("name_bn", "Bangla complaint");
}
