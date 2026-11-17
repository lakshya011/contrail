import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CABINS, EMAIL_KINDS, type Extraction } from "./types";

export const PROMPT_VERSION = 5;
const MODEL = process.env.EXTRACTION_MODEL ?? "anthropic/claude-haiku-5-5";

const legSchema = z.object({
  airlineIata: z.string().nullable().describe("2-character IATA airline code, e.g. 6E, AI, UA"),
  airlineName: z.string().nullable(),
  flightNumber: z.string().describe("Airline code + number, e.g. '6E 2131'"),
  depIata: z.string().describe("3-letter IATA code of the departure airport"),
  arrIata: z.string().describe("3-letter IATA code of the arrival airport"),
  depDate: z.string().nullable().describe("Local departure date, YYYY-MM-DD, exactly as printed for this flight; null if the email does not print it"),
  depTime: z.string().nullable().describe("Local departure time, 24h HH:mm"),
  arrDate: z.string().nullable().describe("Local arrival date, YYYY-MM-DD"),
  arrTime: z.string().nullable().describe("Local arrival time, 24h HH:mm"),
  pnr: z.string().nullable().describe("Booking reference / PNR"),
  seat: z.string().nullable().describe("Seat number(s) as printed, e.g. '21A' or '21A, 21B'"),
  seats: z
    .array(z.object({ passenger: z.string().nullable(), seat: z.string() }))
    .describe("Every seat on this leg; passenger is the name it is printed against, or null if the email doesn't say whose it is"),
  cabin: z.enum(CABINS).nullable(),
  passengers: z.array(z.string()).describe("Passenger names exactly as printed"),
  aircraftType: z.string().nullable(),
  operatedBy: z
    .object({
      airlineIata: z.string().nullable().describe("2-character IATA code of the operating airline"),
      airlineName: z.string().nullable(),
      flightNumber: z.string().nullable().describe("The operating airline's own flight number, if printed"),
    })
    .nullable()
    .describe("Only for codeshares: the airline that actually operates the flight, when the email says 'operated by'. Otherwise null."),
});

const extractionSchema = z.object({
  emailKind: z.enum(EMAIL_KINDS),
  legs: z.array(legSchema),
  confidence: z.number().min(0).max(1),
});

export function aiConfigured() {
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

const SYSTEM = `You extract flight segments from emails for a personal flight log.
Rules:
- Only include flights that are actually booked, ticketed, changed or cancelled in THIS email. Ignore ads, deals, fare alerts, newsletters and "suggested" flights; for those set emailKind "marketing" and legs [].
- One leg per flight segment. A connection or a return trip is several legs.
- Use 3-letter IATA airport codes. Copy a code exactly when the email prints one. If only a city or airport name is printed, give the code of that city's main commercial airport (Bengaluru/Bangalore = BLR, Mumbai = BOM, Delhi = DEL, Hyderabad = HYD, Chennai = MAA, Kolkata = CCU, Goa = GOI or GOX as named). Never answer with a small airfield; double-check that the code belongs to the city in the email.
- flightNumber includes the airline code, e.g. "6E 2131", "AI 101", "UA 901".
- Dates are local dates in YYYY-MM-DD. If only the year is missing, infer it from the email date: flights are normally on or after the email date and within 12 months.
- Never use the email's own date as the flight date. Reminders ("web check-in is open", "complete your check-in") often don't print the flight date: then depDate is null.
- Each leg's arrIata is where THAT flight lands. For a connection (BLR→BOM→JAI) the first leg arrives at BOM, not at the trip's final destination. If an email only names the trip's destination and not this leg's arrival airport, set arrIata to the destination but lower confidence.
- Times are local 24-hour HH:mm. Use null when not printed.
- emailKind: booking (new booking or e-ticket), check_in, boarding_pass, change (schedule change or rebooking), cancellation (flight cancelled or refunded), receipt, marketing, other.
- For a cancellation, return the cancelled legs with emailKind "cancellation".
- passengers: names exactly as printed on the ticket.
- seats: list every seat for this leg. Tie a seat to a passenger only when the email prints them together (a row in a traveller table, a boarding pass in someone's name); otherwise passenger is null.
- Codeshares: when a leg is sold by one airline but "operated by" another, give the flight number you were sold (as printed) in flightNumber and the operating airline in operatedBy. List each physical flight once, even if the email shows both numbers.
- confidence: 0 to 1, how sure you are that the legs are correct.`;

function trimForPrompt(text: string): string {
  const i = text.indexOf("\n\n--- Attachment:");
  if (i < 0) return text.slice(0, 14_000);
  return `${text.slice(0, Math.min(i, 8_000))}${text.slice(i, i + 8_000)}`;
}

export async function extractWithLlm(email: { date: Date | null; from: string; subject: string; text: string }): Promise<Extraction> {
  if (!aiConfigured()) throw new Error("AI Gateway is not configured (set AI_GATEWAY_API_KEY).");
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: extractionSchema }),
    prompt: [
      `Email received: ${email.date?.toISOString().slice(0, 10) ?? "unknown"}`,
      `From: ${email.from}`,
      `Subject: ${email.subject}`,
      "",
      trimForPrompt(email.text),
    ].join("\n"),
  });
  return output;
}
