/**
 * Maps external-provider team names onto our Team rows. Providers spell national
 * teams differently (and use their own ids), so we match on a normalized name,
 * with an explicit alias table for the known divergences. Anything that still
 * doesn't resolve is reported by the sync as "unmatched" rather than guessed.
 */

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalizeTeamName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Known provider-name → FIFA-code aliases for spellings that don't normalize to
 * our own team name. Keyed by the NORMALIZED provider name. Extend this as the
 * "unmatched" report surfaces new divergences from the live feed.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  "usa": "USA",
  "united states of america": "USA",
  "bosnia and herzegovina": "BIH",
  "cape verde": "CPV",
  "cape verde islands": "CPV",
  "czechia": "CZE",
  "congo dr": "COD",
  "dr congo": "COD",
  "democratic republic of congo": "COD",
  "korea republic": "KOR",
  "cote divoire": "CIV",
  "ivory coast": "CIV",
  "turkiye": "TUR",
  "curacao": "CUW",
  "china pr": "CHN",
  "north macedonia": "MKD",
};

export type TeamLookup = {
  /** Resolve a provider team name to our Team id, or null if unmatched. */
  resolve(name: string): string | null;
};

export function buildTeamLookup(
  teams: { id: string; name: string; fifaCode: string }[],
): TeamLookup {
  const byNormName = new Map<string, string>();
  const byFifa = new Map<string, string>();
  for (const t of teams) {
    byNormName.set(normalizeTeamName(t.name), t.id);
    byFifa.set(t.fifaCode.toUpperCase(), t.id);
  }
  return {
    resolve(name: string): string | null {
      const norm = normalizeTeamName(name);
      const direct = byNormName.get(norm);
      if (direct) return direct;
      const aliasCode = PROVIDER_ALIASES[norm];
      if (aliasCode) {
        const viaAlias = byFifa.get(aliasCode);
        if (viaAlias) return viaAlias;
      }
      // Last resort: a provider may hand us the FIFA/ISO code itself.
      return byFifa.get(norm.toUpperCase()) ?? null;
    },
  };
}
