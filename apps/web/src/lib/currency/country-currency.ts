/**
 * ISO-3166 country code → ISO-4217 currency code mapping.
 *
 * Used by the geo-aware CurrencyProvider: given a visitor's country (from
 * `x-vercel-ip-country` header), look up their local currency to display
 * NGN prices converted via the currency_rates table.
 *
 * Pricing is always charged in NGN through Paystack. This mapping is purely
 * for *display* — show "≈ KES 6,500" alongside "₦15,000" so a Nairobi
 * visitor understands the cost at a glance.
 *
 * Covers all 54 African countries explicitly (the user's primary market),
 * plus the major non-African economies as a fallback for diaspora traffic.
 * Anything not in this map falls back to USD.
 */

export const DEFAULT_CURRENCY = "NGN";
export const FALLBACK_NON_AFRICAN_CURRENCY = "USD";

/** All African ISO-3166 alpha-2 codes — used by the provider to decide
    "African visitor → show local African currency" vs "everyone else → USD". */
export const AFRICAN_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG",
  "GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML",
  "MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD",
  "TZ","TG","TN","UG","EH","ZM","ZW",
]);

/** Country → local currency. Order roughly follows TLD order. */
export const COUNTRY_TO_CURRENCY: Readonly<Record<string, string>> = {
  // ── Africa ────────────────────────────────────────────────────────────────
  NG: "NGN",                                  // Nigeria
  GH: "GHS",                                  // Ghana
  KE: "KES",                                  // Kenya
  ZA: "ZAR",                                  // South Africa
  EG: "EGP",                                  // Egypt
  MA: "MAD",                                  // Morocco
  DZ: "DZD",                                  // Algeria
  TN: "TND",                                  // Tunisia
  LY: "LYD",                                  // Libya
  SD: "SDG",                                  // Sudan
  SS: "SSP",                                  // South Sudan
  ET: "ETB",                                  // Ethiopia
  ER: "ERN",                                  // Eritrea
  DJ: "DJF",                                  // Djibouti
  SO: "SOS",                                  // Somalia
  UG: "UGX",                                  // Uganda
  TZ: "TZS",                                  // Tanzania
  RW: "RWF",                                  // Rwanda
  BI: "BIF",                                  // Burundi
  MZ: "MZN",                                  // Mozambique
  ZW: "ZWL",                                  // Zimbabwe
  ZM: "ZMW",                                  // Zambia
  MW: "MWK",                                  // Malawi
  AO: "AOA",                                  // Angola
  BW: "BWP",                                  // Botswana
  NA: "NAD",                                  // Namibia
  LS: "LSL",                                  // Lesotho
  SZ: "SZL",                                  // Eswatini
  MG: "MGA",                                  // Madagascar
  MU: "MUR",                                  // Mauritius
  SC: "SCR",                                  // Seychelles
  KM: "KMF",                                  // Comoros
  CV: "CVE",                                  // Cabo Verde
  ST: "STN",                                  // São Tomé and Príncipe
  GM: "GMD",                                  // Gambia
  GN: "GNF",                                  // Guinea
  SL: "SLE",                                  // Sierra Leone
  LR: "LRD",                                  // Liberia
  MR: "MRU",                                  // Mauritania
  CD: "CDF",                                  // DR Congo
  // West/Central African CFA franc — XOF (BCEAO) and XAF (BEAC)
  BJ: "XOF",                                  // Benin
  BF: "XOF",                                  // Burkina Faso
  CI: "XOF",                                  // Côte d'Ivoire
  GW: "XOF",                                  // Guinea-Bissau
  ML: "XOF",                                  // Mali
  NE: "XOF",                                  // Niger
  SN: "XOF",                                  // Senegal
  TG: "XOF",                                  // Togo
  CM: "XAF",                                  // Cameroon
  CF: "XAF",                                  // Central African Republic
  TD: "XAF",                                  // Chad
  CG: "XAF",                                  // Republic of the Congo
  GA: "XAF",                                  // Gabon
  GQ: "XAF",                                  // Equatorial Guinea
  EH: FALLBACK_NON_AFRICAN_CURRENCY,          // Western Sahara — disputed, fall back

  // ── Major non-African economies (diaspora) ────────────────────────────────
  US: "USD", CA: "CAD", MX: "MXN",
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  AE: "AED", SA: "SAR",
  IN: "INR", PK: "PKR", BD: "BDT",
  CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", SG: "SGD",
  AU: "AUD", NZ: "NZD",
  BR: "BRL", AR: "ARS",
};

/**
 * Resolve a country code → currency code. Falls back to USD for unknown countries.
 * Pass `null`/`undefined` to get the default (NGN).
 */
export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return DEFAULT_CURRENCY;
  const upper = countryCode.toUpperCase();
  return COUNTRY_TO_CURRENCY[upper] ?? FALLBACK_NON_AFRICAN_CURRENCY;
}
