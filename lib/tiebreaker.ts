/**
 * Normalizes a free-text tie-breaker answer so that trivial differences
 * (case, accents, surrounding punctuation, extra whitespace) collapse to the
 * same key. Genuinely different spellings (e.g. "Messi" vs "Lionel Messi" vs a
 * typo) stay distinct — those are resolved by the admin's manual grading.
 */
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}
