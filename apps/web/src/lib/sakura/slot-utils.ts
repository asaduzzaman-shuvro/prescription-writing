export function parseTimeToMinutes(timeString: string): number {
  if (!timeString) return 0;
  const raw = String(timeString).trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?:\s*)(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3]!.toUpperCase() === "PM") h += 12;
    return h * 60 + Number(ampm[2]);
  }
  const parts = raw.split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function getSlotOffPeriods(slot: {
  offPeriods?: { offTimeStart: string; offTimeEnd: string }[] | null;
  offTimeStart?: string | null;
  offTimeEnd?: string | null;
}): { offTimeStart: string; offTimeEnd: string }[] {
  const raw = slot.offPeriods;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((p) => ({
        offTimeStart: String(p?.offTimeStart ?? "").trim(),
        offTimeEnd: String(p?.offTimeEnd ?? "").trim(),
      }))
      .filter((p) => p.offTimeStart && p.offTimeEnd);
  }
  const offS = slot.offTimeStart?.toString().trim();
  const offE = slot.offTimeEnd?.toString().trim();
  if (offS && offE) return [{ offTimeStart: offS, offTimeEnd: offE }];
  return [];
}

export function minuteInDoctorBreak(
  minutes: number,
  slot: {
    offPeriods?: { offTimeStart: string; offTimeEnd: string }[] | null;
    offTimeStart?: string | null;
    offTimeEnd?: string | null;
  },
  slotDurationMin = 0,
): boolean {
  const cellEnd = slotDurationMin > 0 ? minutes + slotDurationMin : minutes + 1;
  for (const p of getSlotOffPeriods(slot)) {
    const os = parseTimeToMinutes(p.offTimeStart);
    const oe = parseTimeToMinutes(p.offTimeEnd);
    if (slotDurationMin > 0) {
      if (minutes < oe && cellEnd > os) return true;
      continue;
    }
    if (minutes >= os && minutes < oe) return true;
  }
  return false;
}

export function normalizeTimeStr(t: string | null | undefined): string {
  if (t == null || t === "") return "";
  let s = String(t).trim();
  if (s.length === 5) s = `${s}:00`;
  return s;
}

export function formatTime12h(timeString: string): string {
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours!, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${period}`;
}
