const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

/** Convert ASCII digits in a string to Bangla digits ("1+0+1" -> "১+০+১"). */
export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

/** Convert Bangla digits in a string to ASCII digits. */
export function toEnDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d as (typeof BN_DIGITS)[number])));
}

export type Numerals = "bn" | "en";

export function digits(input: string | number, numerals: Numerals): string {
  return numerals === "bn" ? toBnDigits(input) : String(input);
}
