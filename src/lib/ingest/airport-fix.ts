/**
 * Catches airport codes misread by one letter, e.g. Bengaluru read as BLU (a Californian airstrip with no
 * airline service) instead of BLR. Only codes that are unknown or have no scheduled service are questioned.
 */
export type AirportInfo = { iata: string; country: string; scheduled: boolean | null };

export type FixContext = {
  /** The airport at the other end of the flight, if known. */
  other?: AirportInfo | null;
  /** Served airports whose code differs from the bad one by a single letter. */
  candidates: AirportInfo[];
  /** Codes used at this end by other copies of the same flight number on the same day. */
  sameFlightCodes?: string[];
  /** How often you have flown from or to each airport. */
  usage?: Map<string, number>;
};

export const needsChecking = (a: AirportInfo | null | undefined) => !a || a.scheduled === false;

/** Every code one letter away from `code` (75 for a 3-letter code). */
export function oneLetterNeighbours(code: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < code.length; i++) {
    for (let c = 65; c <= 90; c++) {
      const ch = String.fromCharCode(c);
      if (ch !== code[i]) out.push(code.slice(0, i) + ch + code.slice(i + 1));
    }
  }
  return out;
}

/** Returns the corrected code, or null when there is no single confident answer. */
export function suggestAirportFix(code: string, ctx: FixContext): string | null {
  const served = ctx.candidates.filter((c) => c.scheduled === true && c.iata !== code);
  if (!served.length) return null;
  const sameCountry = ctx.other ? served.filter((c) => c.country === ctx.other!.country) : [];
  const pool = sameCountry.length ? sameCountry : served;

  // 1. Another copy of this exact flight already uses one of the candidates.
  const sameFlight = pool.filter((c) => ctx.sameFlightCodes?.includes(c.iata));
  if (sameFlight.length === 1) return sameFlight[0].iata;
  // 2. Only one sensible candidate.
  if (pool.length === 1) return pool[0].iata;
  // 3. The candidate you fly most, if it clearly leads.
  const used = pool
    .map((c) => ({ iata: c.iata, n: ctx.usage?.get(c.iata) ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  if (used.length && (used.length === 1 || used[0].n > used[1].n)) return used[0].iata;
  return null;
}
