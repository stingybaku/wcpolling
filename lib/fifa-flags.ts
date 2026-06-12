// Maps FIFA 3-letter codes to ISO 3166-1 alpha-2 codes for flag emoji generation.
// Entries only needed where the codes differ.
const FIFA_TO_ISO2: Record<string, string> = {
  ALG: "DZ", // Algeria
  AUT: "AT",
  AUS: "AU",
  BEL: "BE",
  BIH: "BA", // Bosnia-Herzegovina
  BRA: "BR",
  CAN: "CA",
  CIV: "CI", // Ivory Coast
  COD: "CD", // DR Congo
  COL: "CO",
  CPV: "CV", // Cabo Verde
  CRO: "HR", // Croatia
  CUW: "CW", // Curaçao
  CZE: "CZ",
  ECU: "EC",
  EGY: "EG",
  ESP: "ES",
  FRA: "FR",
  GER: "DE",
  GHA: "GH",
  HAI: "HT", // Haiti
  IRN: "IR", // Iran
  IRQ: "IQ",
  JOR: "JO",
  JPN: "JP",
  KOR: "KR",
  KSA: "SA", // Saudi Arabia
  MAR: "MA",
  MEX: "MX",
  NED: "NL", // Netherlands
  NOR: "NO",
  NZL: "NZ",
  PAN: "PA",
  PAR: "PY", // Paraguay
  POR: "PT",
  QAT: "QA",
  RSA: "ZA", // South Africa
  SEN: "SN",
  SUI: "CH", // Switzerland
  SWE: "SE",
  TUN: "TN",
  TUR: "TR",
  URU: "UY", // Uruguay
  USA: "US",
  UZB: "UZ",
  ARG: "AR",
};

// Subdivision flags (tag sequences) for nations without their own top-level code.
const SUBDIVISION_FLAGS: Record<string, string> = {
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", // England
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", // Scotland
};

function iso2ToEmoji(iso2: string): string {
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join("");
}

export function flagEmoji(fifaCode: string): string {
  const subdivision = SUBDIVISION_FLAGS[fifaCode];
  if (subdivision) return subdivision;

  const iso2 = FIFA_TO_ISO2[fifaCode] ?? fifaCode.slice(0, 2);
  return iso2ToEmoji(iso2);
}

// Maps FIFA codes to the export keys used by `country-flag-icons/react/3x2`
// (ISO 3166-1 alpha-2, with underscore-joined subdivision codes). Used by the
// <TeamFlag> SVG component so flags render identically on every OS — Windows
// ships no flag-emoji glyphs, so the emoji path breaks there.
const SUBDIVISION_FLAG_KEYS: Record<string, string> = {
  ENG: "GB_ENG", // England
  SCO: "GB_SCT", // Scotland
  WAL: "GB_WLS", // Wales
  NIR: "GB_NIR", // Northern Ireland
};

export function fifaToFlagKey(fifaCode: string): string {
  const subdivision = SUBDIVISION_FLAG_KEYS[fifaCode];
  if (subdivision) return subdivision;

  const iso2 = FIFA_TO_ISO2[fifaCode] ?? fifaCode.slice(0, 2);
  return iso2.toUpperCase();
}
