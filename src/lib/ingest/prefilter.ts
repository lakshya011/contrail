const FLIGHT_NO = /\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?\d{2,4}\b/;
const KEYWORDS = /\b(pnr|booking (?:ref|reference|id)|confirmation (?:number|code|no)|e-?ticket|itinerary|depart(?:s|ure|ing)?|arriv(?:al|e|es|ing)|boarding|terminal|gate|flight|check-?in|baggage|seat)\b/gi;

/** Cheap check that an email is plausibly about a specific flight before paying for extraction. */
export function looksLikeFlightEmail(subject: string, text: string): boolean {
  const body = `${subject}\n${text}`.slice(0, 60_000);
  if (!FLIGHT_NO.test(body)) return false;
  const hits = new Set((body.match(KEYWORDS) ?? []).map((k) => k.toLowerCase()));
  return hits.size >= 3;
}
