import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db/client";
import type { Airport, User } from "@/db/schema";
import { GmailClient } from "@/lib/gmail/client";
import { listPage } from "@/lib/gmail/search";
import { fetchEmail } from "@/lib/gmail/fetch";
import { BACKFILL_START, buildQuery } from "@/lib/gmail/senders";
import { looksLikeFlightEmail } from "./prefilter";
import { extractFromMarkup } from "./markup";
import { extractWithLlm, PROMPT_VERSION } from "./llm-extract";
import { isCodeshareTwin, mergeLeg, type FlightState } from "./reconcile";
import { derive } from "./enrich";
import { repairAirports, resolveAirport } from "./airport-repair";
import { repairCodeshares } from "./codeshare-repair";
import { normalizeFlightNumber, type EmailKind, type Extraction } from "./types";
import { isValidDate } from "@/lib/time";

export type SyncProgress = {
  backfillListed: boolean;
  total: number;
  pending: number;
  extracted: number;
  noFlights: number;
  ignored: number;
  errors: number;
  flights: number;
  done: boolean;
  lastError: string | null;
};

const CONCURRENCY = 4;

export async function getProgress(userId: string): Promise<SyncProgress> {
  const db = await getDb();
  const rows = await db
    .select({ status: schema.emailMessages.status, n: sql<number>`count(*)::int` })
    .from(schema.emailMessages)
    .where(eq(schema.emailMessages.userId, userId))
    .groupBy(schema.emailMessages.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const [{ n: flights }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), eq(schema.flights.hidden, false)));
  const [sync] = await db.select().from(schema.gmailSync).where(eq(schema.gmailSync.userId, userId));
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const pending = by.pending ?? 0;
  return {
    backfillListed: !!sync?.backfillListed,
    total, pending,
    extracted: by.extracted ?? 0,
    noFlights: by.no_flights ?? 0,
    ignored: by.ignored ?? 0,
    errors: by.error ?? 0,
    flights: Number(flights),
    done: !!sync?.backfillListed && pending === 0,
    lastError: sync?.lastError ?? null,
  };
}

/**
 * One time-boxed sync pass: list matching Gmail messages (resumable), then extract flights from
 * pending emails until the budget runs out. Call repeatedly until `done`.
 */
export async function runSync(user: User, budgetMs: number): Promise<SyncProgress> {
  const deadline = Date.now() + budgetMs;
  const db = await getDb();
  const gmail = GmailClient.forUser(user);
  await db.insert(schema.gmailSync).values({ userId: user.id }).onConflictDoNothing();
  const [sync] = await db.select().from(schema.gmailSync).where(eq(schema.gmailSync.userId, user.id));

  // Emails that failed only because Gmail said "slow down" are safe to try again.
  await db.update(schema.emailMessages)
    .set({ status: "pending", error: null })
    .where(and(
      eq(schema.emailMessages.userId, user.id),
      eq(schema.emailMessages.status, "error"),
      sql`${schema.emailMessages.error} ~* 'quota exceeded|ratelimitexceeded|too many concurrent'`,
    ));

  try {
    await repairAirports(user.id);
    await repairCodeshares(user.id);
    await listMessages(db, gmail, user.id, sync, deadline);
    await processPending(db, gmail, user, deadline);
    await db.update(schema.gmailSync).set({ lastRunAt: new Date(), lastError: null }).where(eq(schema.gmailSync.userId, user.id));
  } catch (e) {
    await db.update(schema.gmailSync)
      .set({ lastRunAt: new Date(), lastError: (e as Error).message.slice(0, 500) })
      .where(eq(schema.gmailSync.userId, user.id));
  }
  return getProgress(user.id);
}

async function insertIds(db: DB, userId: string, ids: { id: string; threadId: string }[]) {
  if (!ids.length) return;
  await db.insert(schema.emailMessages)
    .values(ids.map((m) => ({ userId, gmailId: m.id, threadId: m.threadId })))
    .onConflictDoNothing();
}

async function listMessages(
  db: DB, gmail: GmailClient, userId: string,
  sync: typeof schema.gmailSync.$inferSelect, deadline: number,
) {
  const set = (v: Partial<typeof schema.gmailSync.$inferInsert>) =>
    db.update(schema.gmailSync).set(v).where(eq(schema.gmailSync.userId, userId));

  if (!sync.backfillListed) {
    // Full backfill to 2016, resumable through the saved page token.
    if (!sync.lastListStartedAt) await set({ lastListStartedAt: new Date() });
    const q = buildQuery(BACKFILL_START);
    let token = sync.backfillPageToken;
    while (Date.now() < deadline - 5_000) {
      const page = await listPage(gmail, q, token);
      await insertIds(db, userId, page.ids);
      token = page.nextPageToken ?? null;
      if (!token) {
        await set({ backfillListed: true, backfillPageToken: null });
        return;
      }
      await set({ backfillPageToken: token });
    }
    return;
  }

  // Incremental: search again from two days before the last listing (cheap, idempotent).
  const since = sync.lastListStartedAt ?? new Date(Date.now() - 7 * 864e5);
  if (sync.lastRunAt && Date.now() - sync.lastRunAt.getTime() < 5 * 60_000) return;
  const startedAt = new Date();
  const q = buildQuery(Math.floor((since.getTime() - 2 * 864e5) / 1000));
  let token: string | null = null;
  do {
    const page = await listPage(gmail, q, token);
    await insertIds(db, userId, page.ids);
    token = page.nextPageToken ?? null;
  } while (token && Date.now() < deadline - 5_000);
  await set({ lastListStartedAt: startedAt });
}

async function processPending(db: DB, gmail: GmailClient, user: User, deadline: number) {
  const aliases = (
    await db.select().from(schema.passengerAliases).where(eq(schema.passengerAliases.userId, user.id))
  ).map((a) => a.name);
  const airportCache = new Map<string, Airport | null>();
  const locks = new Map<string, Promise<unknown>>();

  const airport = async (iata: string) => {
    if (!airportCache.has(iata)) {
      const [a] = await db.select().from(schema.airports).where(eq(schema.airports.iata, iata));
      airportCache.set(iata, a ?? null);
    }
    return airportCache.get(iata) ?? null;
  };

  /** Serialises writes to the same flight key so parallel emails cannot double-insert it. */
  const withLock = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    return next;
  };

  while (Date.now() < deadline - 15_000) {
    const batch = await db
      .select()
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.userId, user.id), eq(schema.emailMessages.status, "pending")))
      .orderBy(schema.emailMessages.id)
      .limit(CONCURRENCY * 3);
    if (!batch.length) return;

    for (let i = 0; i < batch.length && Date.now() < deadline - 15_000; i += CONCURRENCY) {
      await Promise.all(
        batch.slice(i, i + CONCURRENCY).map((row) =>
          processEmail(db, gmail, user, row, aliases, airport, withLock).catch(async (e) => {
            await db.update(schema.emailMessages)
              .set({ status: "error", error: (e as Error).message.slice(0, 500), processedAt: new Date() })
              .where(eq(schema.emailMessages.id, row.id));
          }),
        ),
      );
    }
  }
}

async function processEmail(
  db: DB, gmail: GmailClient, user: User, row: typeof schema.emailMessages.$inferSelect, aliases: string[],
  airport: (iata: string) => Promise<Airport | null>,
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T>,
) {
  const email = await fetchEmail(gmail, row.gmailId);
  const meta = { date: email.date, fromAddr: email.from.slice(0, 300), subject: email.subject.slice(0, 500), threadId: email.threadId };

  let extraction: Extraction | null = extractFromMarkup(email.html);
  let parser = "markup";
  if (!extraction) {
    if (!looksLikeFlightEmail(email.subject, email.text)) {
      await db.update(schema.emailMessages)
        .set({ ...meta, status: "ignored", parser: "none", processedAt: new Date(), error: null })
        .where(eq(schema.emailMessages.id, row.id));
      return;
    }
    extraction = await extractWithLlm(email);
    parser = "llm";
  }

  const saved = await applyExtraction(db, user.id, row.id, extraction, email.date, aliases, airport, withLock);
  await db.update(schema.emailMessages)
    .set({
      ...meta, parser, emailKind: extraction.emailKind, promptVersion: parser === "llm" ? PROMPT_VERSION : null,
      status: saved > 0 ? "extracted" : "no_flights", processedAt: new Date(), error: null,
    })
    .where(eq(schema.emailMessages.id, row.id));
}

/** Validates, merges and saves each leg. Returns the number of flights touched. */
export async function applyExtraction(
  db: DB, userId: string, emailMessageId: number | null, ex: Extraction, emailAt: Date | null, aliases: string[],
  airport: (iata: string) => Promise<Airport | null>,
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T> = (_k, fn) => fn(),
): Promise<number> {
  if (ex.emailKind === "marketing") return 0;
  let n = 0;
  for (const rawLeg of ex.legs) {
    const fn = normalizeFlightNumber(rawLeg.flightNumber, rawLeg.airlineIata);
    if (!fn) continue;
    let raw = rawLeg;
    // Check-in reminders often don't print the flight date (and name the trip's final stop, not this leg's).
    // Attach them to the trip they are about instead of inventing a flight on the email's own date.
    if (await looksUndated(db, userId, fn.full, raw, ex.emailKind, emailAt)) {
      const trip = await upcomingTrip(db, userId, fn.full, emailAt);
      if (!trip) continue;
      raw = { ...raw, depDate: trip.depDate, depIata: trip.depIata, arrIata: trip.arrIata };
    }
    const dep = raw.depIata?.toUpperCase(), arr = raw.arrIata?.toUpperCase();
    if (!/^[A-Z]{3}$/.test(dep ?? "") || !/^[A-Z]{3}$/.test(arr ?? "") || !isValidDate(raw.depDate)) continue;
    // Catch one-letter misreads (BLU for BLR) before the code becomes part of the flight's identity.
    const depFix = await resolveAirport(db, userId, dep, arr, fn.full, raw.depDate, "dep");
    const arrFix = await resolveAirport(db, userId, arr, depFix?.code ?? dep, fn.full, raw.depDate, "arr");
    const notes = [depFix?.note, arrFix?.note].filter((x): x is string => !!x);
    const depCode = depFix?.code ?? dep, arrCode = arrFix?.code ?? arr;
    const depDate: string = raw.depDate;
    const leg = { ...raw, depDate, flightNumber: fn.full, depIata: depCode, arrIata: arrCode, airlineIata: raw.airlineIata ?? (fn.code.length === 2 ? fn.code : null) };
    // Lock per date + departure airport so two codeshare numbers for one flight can't both be created.
    const key = `${leg.depDate}|${depCode}`;

    await withLock(key, async () => {
      let [existing] = await db.select().from(schema.flights).where(and(
        eq(schema.flights.userId, userId), eq(schema.flights.flightNumber, fn.full),
        eq(schema.flights.depDate, leg.depDate), eq(schema.flights.depIata, depCode),
      ));
      if (!existing) {
        // Same physical flight already saved under another airline's number (codeshare)?
        const sameRoute = await db.select().from(schema.flights).where(and(
          eq(schema.flights.userId, userId), eq(schema.flights.depDate, leg.depDate),
          eq(schema.flights.depIata, depCode), eq(schema.flights.arrIata, arrCode),
        ));
        const opNumber = leg.operatedBy?.flightNumber ? normalizeFlightNumber(leg.operatedBy.flightNumber, leg.operatedBy.airlineIata)?.full : null;
        const probe = {
          flightNumber: fn.full, depDate: leg.depDate, depIata: depCode, arrIata: arrCode,
          schedDepLocal: leg.depTime ? `${leg.depDate}T${leg.depTime}` : null, pnr: leg.pnr?.toUpperCase() ?? null,
          codeshareNumbers: opNumber ? [opNumber] : [],
        };
        existing = sameRoute.find((f) => isCodeshareTwin(probe, f)) as typeof existing;
      }
      const state = mergeLeg(existing ?? null, { leg, kind: ex.emailKind as EmailKind, emailAt, confidence: ex.confidence }, aliases);
      const [depA, arrA] = await Promise.all([airport(state.depIata), airport(state.arrIata)]);
      if (!state.airlineName && state.airlineIata) {
        const [al] = await db.select().from(schema.airlines).where(eq(schema.airlines.iata, state.airlineIata));
        state.airlineName = al?.name ?? null;
      }
      const values = { ...pickState(state), ...derive(state, depA, arrA, notes), updatedAt: new Date() };
      let id = existing?.id;
      if (existing) {
        await db.update(schema.flights).set(values).where(eq(schema.flights.id, existing.id));
      } else {
        id = crypto.randomUUID();
        await db.insert(schema.flights).values({ id, userId, source: "email", ...values });
      }
      if (emailMessageId != null) {
        await db.insert(schema.flightSources).values({ flightId: id!, emailMessageId, kind: ex.emailKind }).onConflictDoNothing();
      }
    });
    n++;
  }
  return n;
}

const REMINDER_KINDS: EmailKind[] = ["check_in", "other"];
const DAY = 864e5;

/** True when the leg has no real date: none printed, or a reminder with no time dated the day of the email. */
async function looksUndated(
  db: DB, userId: string, flightNumber: string, leg: Extraction["legs"][number], kind: EmailKind, emailAt: Date | null,
): Promise<boolean> {
  if (!isValidDate(leg.depDate)) return true;
  if (leg.depTime || !REMINDER_KINDS.includes(kind) || !emailAt) return false;
  if (Math.abs(Date.parse(`${leg.depDate}T00:00:00Z`) - emailAt.getTime()) > 1.5 * DAY) return false;
  const [exact] = await db.select({ id: schema.flights.id }).from(schema.flights).where(and(
    eq(schema.flights.userId, userId), eq(schema.flights.flightNumber, flightNumber), eq(schema.flights.depDate, leg.depDate),
  ));
  return !exact;
}

/** Your next flight with this number, from the day before the email up to 60 days after. */
async function upcomingTrip(db: DB, userId: string, flightNumber: string, emailAt: Date | null) {
  if (!emailAt) return null;
  const from = new Date(emailAt.getTime() - DAY).toISOString().slice(0, 10);
  const to = new Date(emailAt.getTime() + 60 * DAY).toISOString().slice(0, 10);
  const [trip] = await db.select().from(schema.flights).where(and(
    eq(schema.flights.userId, userId), eq(schema.flights.flightNumber, flightNumber), eq(schema.flights.hidden, false),
    sql`${schema.flights.depDate} BETWEEN ${from} AND ${to}`,
  )).orderBy(schema.flights.depDate).limit(1);
  return trip ?? null;
}

function pickState(s: FlightState) {
  const { userConfirmed: _u, ...rest } = s;
  return rest;
}

export async function resetEmails(userId: string, which: "all" | "errors") {
  const db = await getDb();
  await db.update(schema.emailMessages)
    .set({ status: "pending", error: null })
    .where(and(
      eq(schema.emailMessages.userId, userId),
      which === "errors" ? eq(schema.emailMessages.status, "error") : inArray(schema.emailMessages.status, ["extracted", "no_flights", "ignored", "error"]),
    ));
}
