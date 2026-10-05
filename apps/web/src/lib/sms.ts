import "server-only";

/**
 * SMS delivery through a BTRC-authorised Bangladeshi gateway. Gateways differ, so the HTTP provider
 * is configured with a URL template rather than code per vendor:
 *   SMS_PROVIDER=http
 *   SMS_HTTP_URL=https://gateway.example/api/send?api_key={key}&senderid={sender}&number={to}&message={message}
 *   SMS_API_KEY=...   SMS_SENDER_ID=...   (registered masking name, max 11 chars)
 *   SMS_HTTP_SUCCESS=regex matched against the response body (optional; default HTTP 2xx)
 * SMS_PROVIDER=console (default) only logs — for development.
 */

export interface SmsResult {
  ok: boolean;
  provider: string;
  ref?: string;
  error?: string;
}

/** Bangla text is UCS-2: 70 chars in one SMS, 67 per segment when split. GSM-7: 160 / 153. */
export function smsSegments(body: string): number {
  // eslint-disable-next-line no-control-regex
  const unicode = /[^\x00-\x7F]/.test(body);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return body.length <= single ? 1 : Math.ceil(body.length / multi);
}

export function toBdMsisdn(mobile: string): string | null {
  const d = mobile.replace(/\D/g, "");
  const local = d.startsWith("880") ? `0${d.slice(3)}` : d;
  return /^01[3-9]\d{8}$/.test(local) ? `88${local}` : null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER ?? "console";
  if (provider === "console") {
    console.info(`[sms:console] to=${to} ${body}`);
    return { ok: true, provider, ref: `console-${Date.now()}` };
  }
  if (provider === "http") {
    const tpl = process.env.SMS_HTTP_URL;
    if (!tpl) return { ok: false, provider, error: "SMS_HTTP_URL not configured" };
    const url = tpl
      .replace("{key}", encodeURIComponent(process.env.SMS_API_KEY ?? ""))
      .replace("{sender}", encodeURIComponent(process.env.SMS_SENDER_ID ?? ""))
      .replace("{to}", encodeURIComponent(to))
      .replace("{message}", encodeURIComponent(body));
    try {
      const res = await fetch(url, { method: process.env.SMS_HTTP_METHOD ?? "GET", signal: AbortSignal.timeout(15_000) });
      const text = await res.text();
      const okPattern = process.env.SMS_HTTP_SUCCESS ? new RegExp(process.env.SMS_HTTP_SUCCESS) : null;
      const ok = res.ok && (!okPattern || okPattern.test(text));
      return ok ? { ok, provider, ref: text.slice(0, 120) } : { ok, provider, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, provider, error: (e as Error).message };
    }
  }
  return { ok: false, provider, error: `unknown SMS_PROVIDER ${provider}` };
}
