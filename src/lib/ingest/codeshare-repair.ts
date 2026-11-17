import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Flight } from "@/db/schema";
import { isCodeshareTwin, unionNames } from "./reconcile";
import { rematchPassengers } from "./rematch";
import { mergeSeats } from "@/lib/seats";

/** Which copy to keep: the one flown by the operating airline if known, otherwise the first one saved. */
function pickPrimary(group: Flight[]): Flight {
  const op = group.find((f) => f.operatingAirlineIata)?.operatingAirlineIata;
  return (op && group.find((f) => f.airlineIata === op)) || group[0];
}

/**
 * Folds codeshare duplicates (one physical flight saved under two airlines' numbers) into a single flight.
 * Its emails are queued to be read again so the operating airline gets recorded. Returns flights removed.
 */
export async function repairCodeshares(userId: string): Promise<number> {
  const db = await getDb();
  const all = await db
    .select()
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), eq(schema.flights.hidden, false)))
    .orderBy(asc(schema.flights.createdAt));

  const byRoute = new Map<string, Flight[]>();
  for (const f of all) {
    const k = `${f.depDate}|${f.depIata}|${f.arrIata}`;
    byRoute.set(k, [...(byRoute.get(k) ?? []), f]);
  }

  let removed = 0;
  const touched: string[] = [];
  for (const flights of byRoute.values()) {
    if (flights.length < 2) continue;
    const used = new Set<string>();
    for (const a of flights) {
      if (used.has(a.id)) continue;
      const group = [a, ...flights.filter((b) => b.id !== a.id && !used.has(b.id) && isCodeshareTwin(a, b))];
      if (group.length < 2) continue;
      group.forEach((g) => used.add(g.id));

      const p = pickPrimary(group);
      const others = group.filter((g) => g.id !== p.id);
      const fill = <K extends keyof Flight>(k: K) => p[k] ?? others.find((o) => o[k] != null)?.[k] ?? null;
      const numbers = new Set([...(p.codeshareNumbers ?? []), ...others.flatMap((o) => [o.flightNumber, ...(o.codeshareNumbers ?? [])])]);
      numbers.delete(p.flightNumber);

      for (const o of others) {
        await db.execute(sql`
          INSERT INTO flight_sources (flight_id, email_message_id, kind)
          SELECT ${p.id}, email_message_id, kind FROM flight_sources WHERE flight_id = ${o.id}
          ON CONFLICT DO NOTHING`);
      }
      await db.update(schema.flights).set({
        codeshareNumbers: [...numbers],
        passengerNames: others.reduce((acc, o) => unionNames(acc, o.passengerNames ?? []), p.passengerNames ?? []),
        seat: fill("seat"), seats: others.reduce((acc, o) => mergeSeats(acc, o.seats ?? [], false), p.seats ?? []), cabin: fill("cabin"), pnr: fill("pnr"), aircraftType: fill("aircraftType"),
        operatingAirlineIata: fill("operatingAirlineIata"), operatingAirlineName: fill("operatingAirlineName"),
        forOthers: p.forOthers && others.every((o) => o.forOthers),
        updatedAt: new Date(),
      }).where(eq(schema.flights.id, p.id));
      await db.delete(schema.flights).where(inArray(schema.flights.id, others.map((o) => o.id)));
      removed += others.length;
      touched.push(p.id);
    }
  }

  if (touched.length) {
    // Read these emails again with the codeshare-aware prompt, to learn which airline operates each flight.
    await db.execute(sql`
      UPDATE email_messages SET status = 'pending', error = NULL
      WHERE id IN (SELECT email_message_id FROM flight_sources WHERE flight_id IN (${sql.join(touched.map((t) => sql`${t}`), sql`, `)}))`);
    await rematchPassengers(userId);
  }
  return removed;
}
