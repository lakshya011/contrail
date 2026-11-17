/** Passenger-name matching shared by the importer and seat handling. */
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "MSTR", "MASTER", "DR", "SHRI", "SMT", "PROF", "CHD", "INF", "ADT"]);

export function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[/,.]/g, " ")
    .replace(/[^A-Z\s]/g, "")
    .split(/\s+/)
    .map((t) => t.replace(/(MR|MRS|MS|MSTR)$/, (m, _g, off, s: string) => (s.length > m.length + 2 ? "" : m)))
    .filter((t) => t && !TITLES.has(t));
}

/** True when the printed passenger name is one of your aliases (order and titles ignored). */
export function nameMatches(passenger: string, aliases: string[]): boolean {
  const p = new Set(nameTokens(passenger));
  if (!p.size) return false;
  return aliases.some((a) => {
    const at = nameTokens(a);
    if (!at.length) return false;
    if (at.every((t) => p.has(t))) return true;
    return p.size >= 2 && [...p].every((t) => at.includes(t));
  });
}
