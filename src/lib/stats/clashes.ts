/**
 * Finds flights you cannot all have taken: usually a rebooking whose cancellation email never arrived.
 *  - Overlap: a flight leaves before the previous one has landed.
 *  - Same airport twice in a day: you leave the same airport again with no flight back there in between.
 * Only your own, not-cancelled flights are compared. A pair you have confirmed on both sides is left alone.
 */
export type ClashFlight = {
  id: string;
  flightNumber: string;
  depDate: string;
  depIata: string;
  arrIata: string;
  schedDepLocal: string | null;
  schedDepUtc: Date | null;
  schedArrUtc: Date | null;
  userConfirmed: boolean;
};

export type Clash = { withIds: string[]; withNumbers: string[]; reason: string };

const sortKey = (f: ClashFlight) => f.schedDepUtc?.getTime() ?? Date.parse(`${f.schedDepLocal ?? `${f.depDate}T12:00`}:00Z`);

export function findClashes(flights: ClashFlight[]): Map<string, Clash> {
  const fs = [...flights].sort((a, b) => sortKey(a) - sortKey(b));
  const out = new Map<string, Clash>();
  const add = (a: ClashFlight, b: ClashFlight, reason: string) => {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const c = out.get(x.id) ?? { withIds: [], withNumbers: [], reason };
      if (!c.withIds.includes(y.id)) {
        c.withIds.push(y.id);
        c.withNumbers.push(y.flightNumber);
      }
      out.set(x.id, c);
    }
  };

  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length && j <= i + 6; j++) {
      const a = fs[i], b = fs[j];
      if (a.userConfirmed && b.userConfirmed) continue;
      const overlap = a.schedArrUtc && b.schedDepUtc && b.schedDepUtc < a.schedArrUtc
        && b.schedDepUtc.getTime() - (a.schedDepUtc?.getTime() ?? 0) < 24 * 3600e3;
      if (overlap) {
        add(a, b, "These flights overlap in time, so you can't have taken both");
        continue;
      }
      if (a.depDate === b.depDate && a.depIata === b.depIata) {
        const backInBetween = fs.slice(i, j).some((k) => k.arrIata === a.depIata);
        if (!backInBetween) add(a, b, `You'd have left ${a.depIata} twice that day with no flight back in between`);
      }
    }
  }
  return out;
}
