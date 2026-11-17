import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nameMatches, ownership } from "./reconcile";

/**
 * Re-decides "yours or someone else's" for every flight from the passenger names already saved,
 * so changing your names in Settings takes effect without re-reading any email.
 * Flights you edited or confirmed by hand are left alone. Returns how many flights changed.
 */
export async function rematchPassengers(userId: string): Promise<number> {
  const db = await getDb();
  const aliases = (await db.select().from(schema.passengerAliases).where(eq(schema.passengerAliases.userId, userId))).map((a) => a.name);
  const flights = await db
    .select({
      id: schema.flights.id, names: schema.flights.passengerNames, name: schema.flights.passengerName,
      forOthers: schema.flights.forOthers, confirmed: schema.flights.userConfirmed,
    })
    .from(schema.flights)
    .where(eq(schema.flights.userId, userId));

  let changed = 0;
  for (const f of flights) {
    if (f.confirmed) continue;
    const names = f.names?.length ? f.names : f.name ? [f.name] : [];
    const { forOthers, mine } = ownership(names, aliases);
    // Keep the displayed name if it is still one of yours; only fill it in when it is not.
    const passengerName = f.name && nameMatches(f.name, aliases) ? f.name : mine ?? f.name;
    if (forOthers === f.forOthers && passengerName === f.name) continue;
    await db.update(schema.flights).set({ forOthers, passengerName, updatedAt: new Date() }).where(eq(schema.flights.id, f.id));
    changed++;
  }
  return changed;
}
