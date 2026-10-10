import "server-only";
import { sendSms, toBdMsisdn } from "./sms";

/**
 * Delivers account messages. Prefers SMS when a BD mobile is on file; otherwise logs
 * (and optional EMAIL_HTTP_URL) so local/dev never fails silently.
 */
export async function sendAccountMessage(opts: {
  email: string;
  phone?: string | null;
  subject: string;
  body: string;
  /** Short SMS body; falls back to `body` truncated. */
  smsBody?: string;
}): Promise<{ channel: "sms" | "email" | "console"; ok: boolean }> {
  const msisdn = opts.phone ? toBdMsisdn(opts.phone) : null;
  if (msisdn) {
    const res = await sendSms(msisdn, opts.smsBody ?? opts.body.slice(0, 300));
    if (res.ok) return { channel: "sms", ok: true };
  }

  const tpl = process.env.EMAIL_HTTP_URL;
  if (tpl) {
    const url = tpl
      .replace("{to}", encodeURIComponent(opts.email))
      .replace("{subject}", encodeURIComponent(opts.subject))
      .replace("{message}", encodeURIComponent(opts.body))
      .replace("{key}", encodeURIComponent(process.env.EMAIL_API_KEY ?? ""));
    try {
      const res = await fetch(url, { method: process.env.EMAIL_HTTP_METHOD ?? "POST", signal: AbortSignal.timeout(15_000) });
      if (res.ok) return { channel: "email", ok: true };
    } catch {
      /* fall through to console */
    }
  }

  console.info(`[account-mail] to=${opts.email} subject=${opts.subject}\n${opts.body}`);
  return { channel: "console", ok: true };
}
