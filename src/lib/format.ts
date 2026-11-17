import { kmToMi } from "@/lib/geo/distance";

export type Units = "km" | "mi";

export function fmtDistance(km: number | null | undefined, units: string = "km"): string {
  if (km == null) return "—";
  const v = units === "mi" ? kmToMi(km) : km;
  return `${Math.round(v).toLocaleString("en-US")} ${units === "mi" ? "mi" : "km"}`;
}

export function fmtNumber(n: number, digits = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtHours(min: number) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export const CABIN_LABEL: Record<string, string> = {
  economy: "Economy", premium_economy: "Premium Economy", business: "Business", first: "First",
};
