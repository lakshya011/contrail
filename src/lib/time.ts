/** Offset (ms) of an IANA time zone from UTC at a given instant. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Converts a local wall-clock time ("YYYY-MM-DDTHH:mm") in `tz` to a UTC Date. */
export function localToUtc(local: string, tz: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!tz) return new Date(guess);
  try {
    let off = tzOffsetMs(tz, new Date(guess));
    const second = tzOffsetMs(tz, new Date(guess - off));
    if (second !== off) off = second; // crossed a DST boundary
    return new Date(guess - off);
  } catch {
    return new Date(guess);
  }
}

export function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function isValidTime(s: string | null | undefined): s is string {
  return !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function formatDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

/** "2024-03-12" -> "Tue, 12 Mar 2024" without timezone shifts. */
export function formatDate(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, d)));
}

export function timeOf(local: string | null | undefined): string | null {
  return local && local.length >= 16 ? local.slice(11, 16) : null;
}

/** UTC instant -> local wall-clock "YYYY-MM-DDTHH:mm" in `tz`. */
export function utcToLocal(d: Date, tz: string | null | undefined): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz ?? "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
