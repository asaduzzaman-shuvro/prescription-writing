/** SQL fragments for scoping patient lists to the active RxPad chamber. */

export const WRITTEN_RX = `EXISTS (
  SELECT 1 FROM prescription rx
   WHERE rx.patient_id = p.id
     AND (rx.status = 'final' OR rx.doc LIKE '%"items": [{%' OR rx.doc LIKE '%"items":[{%')
)`;

const TODAY_VISIT = (chamberId: string | null) =>
  chamberId
    ? `EXISTS (SELECT 1 FROM encounter e WHERE e.patient_id = p.id AND e.visit_date = ? AND e.chamber_id = ? AND e.status <> 'cancelled')`
    : `EXISTS (SELECT 1 FROM encounter e WHERE e.patient_id = p.id AND e.visit_date = ? AND e.status <> 'cancelled')`;

const APPT_TODAY = (chamberId: string | null) =>
  chamberId
    ? `EXISTS (SELECT 1 FROM appointment a WHERE a.patient_id = p.id AND a.appt_date = ? AND a.chamber_id = ? AND a.status <> 'cancelled')`
    : `EXISTS (SELECT 1 FROM appointment a WHERE a.patient_id = p.id AND a.appt_date = ? AND a.status <> 'cancelled')`;

const REGISTERED_TODAY = `substr(p.created_at, 1, 10) = ?`;

/** Patients with a visit or booking today at this chamber (or any chamber when none selected). */
export function onTodayWhere(chamberId: string | null) {
  if (chamberId) {
    return `(${TODAY_VISIT(chamberId)} OR ${APPT_TODAY(chamberId)})`;
  }
  return `((${TODAY_VISIT(null)}) OR (${REGISTERED_TODAY}))`;
}

export function onTodayParams(date: string, chamberId: string | null): string[] {
  if (chamberId) return [date, chamberId, date, chamberId];
  return [date, date];
}

/** Patient has ever been seen or booked at this chamber. When no chamber, no extra filter. */
export function chamberLinkedWhere(chamberId: string | null) {
  if (!chamberId) return "1=1";
  return `EXISTS (
    SELECT 1 FROM encounter e WHERE e.patient_id = p.id AND e.chamber_id = ? AND e.status <> 'cancelled'
    UNION ALL
    SELECT 1 FROM appointment a WHERE a.patient_id = p.id AND a.chamber_id = ? AND a.status <> 'cancelled'
  )`;
}

export function chamberLinkedParams(chamberId: string | null): string[] {
  return chamberId ? [chamberId, chamberId] : [];
}

export type PatientGroup = "today" | "unseen" | "seen";

export function groupWhere(group: PatientGroup, date: string, chamberId: string | null) {
  const onToday = onTodayWhere(chamberId);
  const linked = chamberLinkedWhere(chamberId);
  const base =
    group === "today"
      ? `(${onToday}) AND NOT (${WRITTEN_RX})`
      : group === "unseen"
        ? `NOT (${WRITTEN_RX}) AND NOT (${onToday})`
        : WRITTEN_RX;
  if (!chamberId) return base;
  // Today is already scoped by chamber on visits/bookings; "linked" only for unseen/seen.
  if (group === "today") return base;
  return `(${base}) AND (${linked})`;
}

export function groupCountParams(group: PatientGroup, date: string, chamberId: string | null): string[] {
  const parts: string[] = [];
  if (group === "today" || group === "unseen") parts.push(...onTodayParams(date, chamberId));
  if (chamberId && group !== "today") parts.push(...chamberLinkedParams(chamberId));
  return parts;
}
