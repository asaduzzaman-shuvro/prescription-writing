"use client";

import { useState } from "react";

/** Send the verification link to the patient. WhatsApp works from the device; SMS goes via the server gateway. */
export function ShareButtons({ mobile, patientName, verifyUrl, prescriptionId }: { mobile: string | null; patientName: string; verifyUrl: string; prescriptionId: string }) {
  const [sms, setSms] = useState<string>();
  const intl = mobile ? `88${mobile}` : "";
  const text = `${patientName}, আপনার প্রেসক্রিপশন: ${verifyUrl}`;
  async function sendSms() {
    setSms("Sending…");
    const res = await fetch(`/api/share/sms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prescriptionId }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : { error: "You are offline" };
    setSms(res?.ok ? "SMS sent" : (body.error ?? "SMS failed"));
  }
  return (
    <span className="flex items-center gap-2">
      {mobile && (
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/${intl}?text=${encodeURIComponent(text)}`}>WhatsApp</a>
      )}
      {mobile && <button className="btn-secondary" onClick={sendSms}>SMS</button>}
      {sms && <span className="text-xs text-slate-500">{sms}</span>}
    </span>
  );
}
