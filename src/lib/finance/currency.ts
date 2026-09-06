// ============================================================================
// Finance — currency registry + pure formatting (server-safe, no React)
// SchoolAid stores a currency CODE on the school (schools.currency) — never a
// symbol. Symbols/positions are derived here so every screen, receipt and
// invoice renders the same way:  NGN "₦75,000"  ·  XOF "75,000 FCFA".
// ============================================================================

export type CurrencyDef = { code: string; name: string; symbol: string; after?: boolean };

export const CURRENCIES: Record<string, CurrencyDef> = {
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  USD: { code: "USD", name: "US Dollar", symbol: "$" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£" },
  EUR: { code: "EUR", name: "Euro", symbol: "€" },
  XOF: { code: "XOF", name: "West African CFA Franc", symbol: "FCFA", after: true },
  XAF: { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", after: true },
};

export const CURRENCY_OPTIONS: CurrencyDef[] = Object.values(CURRENCIES);

/** Resolve a code to its definition; unknown/missing codes fall back to NGN. */
export const currencyDef = (code?: string | null): CurrencyDef =>
  (code && CURRENCIES[code.toUpperCase()]) || CURRENCIES.NGN;

/** "75,000 FCFA" style full amount for a currency code. */
export const formatMoney = (n: number | string | null | undefined, code?: string | null): string => {
  const def = currencyDef(code);
  const amount = Number(n || 0).toLocaleString();
  return def.after ? `${amount} ${def.symbol}` : `${def.symbol}${amount}`;
};

/** Compact amounts ("₦2.5m", "13k") for dashboard strips and tables. */
export const formatMoneyShort = (n: number | string | null | undefined, code?: string | null): string => {
  const def = currencyDef(code);
  const v = Number(n || 0);
  let label: string;
  if (Math.abs(v) >= 1_000_000) label = `${(v / 1_000_000).toFixed(1)}m`;
  else if (Math.abs(v) >= 1_000) label = `${(v / 1_000).toFixed(0)}k`;
  else label = v.toLocaleString();
  return def.after ? `${label} ${def.symbol}` : `${def.symbol}${label}`;
};
