import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { passportFlights } from "@/lib/data";
import { computePassport } from "@/lib/stats/passport";
import { fmtDistance, fmtHours, fmtNumber } from "@/lib/format";
import { YearStory, type Slide } from "@/components/YearStory";

export default async function YearInReview({ params }: PageProps<"/passport/year/[year]">) {
  const user = await requireUser();
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) notFound();
  const p = computePassport(await passportFlights(user), year);
  if (!p.totals.flights) notFound();
  const t = p.totals, r = p.records;
  const slides: Slide[] = [
    { kicker: "Flights", big: String(t.flights), text: `flights taken in ${year}, on ${t.airlines} airline${t.airlines === 1 ? "" : "s"}.` },
    { kicker: "Distance", big: fmtDistance(t.distanceKm, user.units), text: `That is ${fmtNumber(t.earthLaps, 2)} times around the Earth.` },
    { kicker: "In the air", big: fmtHours(t.durationMin), text: `About ${fmtNumber(t.durationMin / 60)} hours above the clouds.` },
    p.topAirports[0] && { kicker: "Most visited", big: p.topAirports[0].label, text: `${p.topAirports[0].sub ?? ""}: you passed through ${p.topAirports[0].count} times.` },
    p.topRoutes[0] && { kicker: "Favourite route", big: p.topRoutes[0].label, text: `Flown ${p.topRoutes[0].count} time${p.topRoutes[0].count === 1 ? "" : "s"}.` },
    { kicker: "Places", big: `${t.countries} ${t.countries === 1 ? "country" : "countries"}`, text: p.countries.map((c) => `${c.flag} ${c.label}`).join("  ") },
    r.longest && { kicker: "Longest flight", big: `${r.longest.depIata} → ${r.longest.arrIata}`, text: `${fmtDistance(r.longest.distanceKm, user.units)}, the furthest you went in one go.` },
    r.busiestMonth && { kicker: "Busiest month", big: new Date(`${r.busiestMonth.month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }), text: `${r.busiestMonth.flights} flights in one month.` },
  ].filter((s): s is Slide => !!s);
  return <YearStory year={year} slides={slides} />;
}
