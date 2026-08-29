/**
 * Human-readable order number that doubles as the pickup token shown at the counter.
 * Format: PF-XXXXX using a Crockford-style alphabet (no ambiguous 0/O/1/I/L).
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateOrderNumber(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return `PF-${code}`;
}

export function isValidOrderNumber(value: string): boolean {
  return /^PF-[2-9A-HJ-NP-TV-Z]{5}$/.test(value);
}
