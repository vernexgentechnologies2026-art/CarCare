/**
 * Normalises an Indian registration number to dashed form.
 * Accepts `TN09AB1234`, `tn 09 ab 1234`, `TN-09-AB-1234` and BH-series `22BH1234AA`.
 * Returns null when the input is not a recognisable format.
 */
export function normaliseRegistration(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const bh = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/.exec(raw);
  if (bh) return `${bh[1]}-BH-${bh[2]}-${bh[3]}`;
  const std = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(raw);
  if (!std) return null;
  const [, state, rto, series, num] = std;
  if (state === undefined || rto === undefined || series === undefined || num === undefined) return null;
  return [state, rto.padStart(2, '0'), series, num.padStart(4, '0')].filter(Boolean).join('-');
}

/** Strips formatting and an optional +91 / 0 prefix. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Lower-cased, separator-free form for fuzzy matching of plates, flats and names. */
export const searchKey = (value: string): string => value.toLowerCase().replace(/[\s-]/g, '');
