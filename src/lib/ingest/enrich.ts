import type { Airport } from "@/db/schema";
import { estimateDurationMin, haversineKm } from "@/lib/geo/distance";
import { localToUtc } from "@/lib/time";
import type { FlightState } from "./reconcile";

export type Derived = {
  schedDepUtc: Date | null;
  schedArrUtc: Date | null;
  distanceKm: number | null;
  durationMin: number | null;
  needsReview: boolean;
  reviewReason: string | null;
};

/** Distance, UTC times, duration and review flags from airport data. */
export function derive(s: FlightState, dep?: Airport | null, arr?: Airport | null, notes: string[] = []): Derived {
  const reasons: string[] = [...notes];
  if (!dep) reasons.push(`Unknown airport ${s.depIata}`);
  if (!arr) reasons.push(`Unknown airport ${s.arrIata}`);
  for (const a of [dep, arr]) {
    if (a?.scheduled === false && !notes.some((n) => n.includes(a.iata))) reasons.push(`${a.iata} (${a.city ?? a.name}, ${a.country}) has no airline service`);
  }
  if (s.depIata === s.arrIata) reasons.push("Departure and arrival are the same airport");
  if ((s.confidence ?? 1) < 0.6) reasons.push("Low extraction confidence");

  const distanceKm = dep && arr ? Math.round(haversineKm(dep.lat, dep.lon, arr.lat, arr.lon)) : null;
  const schedDepUtc = s.schedDepLocal ? localToUtc(s.schedDepLocal, dep?.tz) : null;
  const schedArrUtc = s.schedArrLocal ? localToUtc(s.schedArrLocal, arr?.tz) : null;

  let durationMin: number | null = null;
  if (schedDepUtc && schedArrUtc && dep?.tz && arr?.tz) {
    const d = Math.round((schedArrUtc.getTime() - schedDepUtc.getTime()) / 60000);
    if (d > 0 && d < 24 * 60) durationMin = d;
    else reasons.push("Arrival time is before departure or over 24h later");
  }
  if (durationMin == null && distanceKm != null) durationMin = estimateDurationMin(distanceKm);

  return {
    schedDepUtc, schedArrUtc, distanceKm, durationMin,
    needsReview: !s.userConfirmed && reasons.length > 0,
    reviewReason: reasons.length ? reasons.join("; ") : null,
  };
}
