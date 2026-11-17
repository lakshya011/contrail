/**
 * Gmail search used to find flight emails. Edit these lists to add senders or phrases.
 * The search is deliberately broad; the pre-filter and extraction steps weed out noise.
 */
export const BACKFILL_START = "2016/01/01";

export const SUBJECT_TERMS = [
  "itinerary", "e-ticket", "eticket", "\"boarding pass\"", "\"booking confirmation\"",
  "\"booking confirmed\"", "\"flight confirmation\"", "\"your flight\"", "\"your trip\"",
  "\"web check-in\"", "\"check-in\"", "PNR", "\"flight booking\"", "\"schedule change\"",
  "\"flight cancelled\"", "\"flight canceled\"", "reservation", "\"travel confirmation\"",
];

export const SENDER_TERMS = [
  // India
  "goindigo", "airindia", "airvistara", "vistara", "spicejet", "goair", "flygofirst", "akasaair",
  "airindiaexpress", "allianceair", "makemytrip", "cleartrip", "goibibo", "yatra", "ixigo", "easemytrip",
  "paytm", "airasia",
  // Global carriers and agencies
  "united", "aa.com", "delta", "southwest", "alaskaair", "jetblue", "aircanada", "britishairways", "ba.com",
  "lufthansa", "airfrance", "klm", "emirates", "qatarairways", "etihad", "singaporeair", "cathaypacific",
  "turkishairlines", "thaiairways", "qantas", "ana.co.jp", "jal", "flydubai", "airarabia", "ryanair",
  "easyjet", "virginatlantic", "swiss", "expedia", "booking.com", "kayak", "tripit", "agoda", "trip.com",
];

export function buildQuery(after: string | number): string {
  return `after:${after} (subject:(${SUBJECT_TERMS.join(" OR ")}) OR from:(${SENDER_TERMS.join(" OR ")})) -in:chats`;
}
