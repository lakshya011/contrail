export const EMAIL_KINDS = [
  "booking", "check_in", "boarding_pass", "change", "cancellation", "receipt", "marketing", "other",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const CABINS = ["economy", "premium_economy", "business", "first"] as const;
export type Cabin = (typeof CABINS)[number];

export type ExtractedLeg = {
  airlineIata: string | null;
  airlineName: string | null;
  flightNumber: string;
  depIata: string;
  arrIata: string;
  depDate: string | null; // YYYY-MM-DD local; null when the email doesn't print it
  depTime: string | null; // HH:mm local
  arrDate: string | null;
  arrTime: string | null;
  pnr: string | null;
  seat: string | null;
  /** Seats per passenger when the email ties them together. */
  seats?: { passenger: string | null; seat: string }[];
  cabin: Cabin | null;
  passengers: string[];
  aircraftType: string | null;
  /** Codeshare: the airline actually flying it ("operated by …"), when the email says so. */
  operatedBy: { airlineIata: string | null; airlineName: string | null; flightNumber: string | null } | null;
};

export type Extraction = { emailKind: EmailKind; legs: ExtractedLeg[]; confidence: number };

/** "6e 0231" -> { code: "6E", number: "231", full: "6E231" } */
export function normalizeFlightNumber(raw: string, airlineIata?: string | null) {
  let s = raw.toUpperCase().replace(/[\s\-–.]/g, "");
  if (/^\d{1,4}$/.test(s) && airlineIata) s = airlineIata.toUpperCase() + s;
  const m = /^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4})[A-Z]?$/.exec(s);
  if (!m) return null;
  const num = String(Number(m[2]));
  return { code: m[1], number: num, full: `${m[1]}${num}` };
}

/** "6E2131" -> "6E 2131" for display. */
export function displayFlightNumber(full: string) {
  const m = /^([A-Z0-9]{2}|[A-Z]{3})(\d+)$/.exec(full);
  return m ? `${m[1]} ${m[2]}` : full;
}
