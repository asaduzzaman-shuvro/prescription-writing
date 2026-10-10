import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding), for authenticator apps. */
export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const code = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Verify a 6-digit TOTP (±1 step). */
export function verifyTotp(secretBase32: string, token: string, stepSec = 30, window = 1): boolean {
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSec);
  const expected = Buffer.from(clean);
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(hotp(key, counter + i));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export function totpOtpauthUrl(opts: { secret: string; email: string; issuer?: string }): string {
  const issuer = encodeURIComponent(opts.issuer ?? "RxPad BD");
  const label = encodeURIComponent(`${opts.issuer ?? "RxPad BD"}:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&digits=6&period=30`;
}
