/**
 * One display name per airline code, chosen from the names on your own tickets.
 * Emails spell the same airline differently ("GO FIRST", "Go First"; "AIR ASIA", "AirAsia"), and the
 * reference list is sometimes out of date (it names I5 "Indonesia Sky"). The spelling used most wins.
 */
export type NameCount = { code: string | null; name: string | null; n: number };

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();

export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** "Virgin Atlantic Airways Limited" -> "Virgin Atlantic Airways". */
export function cleanAirlineName(name: string) {
  return name.trim().replace(/\s+/g, " ").replace(/[\s,]+(limited|ltd\.?|inc\.?|plc|llc|pvt\.? ltd\.?|private limited|co\.)$/i, "");
}

export function canonicalAirlineNames(rows: NameCount[]): Map<string, string> {
  const byCode = new Map<string, Map<string, { total: number; variants: Map<string, number> }>>();
  for (const r of rows) {
    if (!r.code || !r.name?.trim()) continue;
    const name = cleanAirlineName(r.name);
    const groups = byCode.get(r.code) ?? new Map();
    const g = groups.get(key(name)) ?? { total: 0, variants: new Map<string, number>() };
    g.total += r.n;
    g.variants.set(name, (g.variants.get(name) ?? 0) + r.n);
    groups.set(key(name), g);
    byCode.set(r.code, groups);
  }
  const out = new Map<string, string>();
  for (const [code, groups] of byCode) {
    const best = [...groups.values()].sort((a, b) => b.total - a.total)[0];
    const variants = [...best.variants.entries()].sort((a, b) => b[1] - a[1]);
    const mixed = variants.find(([v]) => !isAllCaps(v));
    out.set(code, mixed ? mixed[0] : titleCase(variants[0][0]));
  }
  return out;
}
