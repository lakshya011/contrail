import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getUser } from "@/lib/auth/session";
import { passportFlights } from "@/lib/data";
import { computePassport } from "@/lib/stats/passport";
import { fmtHours, fmtNumber } from "@/lib/format";
import { kmToMi } from "@/lib/geo/distance";
import { LOGO_COLORS, LogoSvg } from "@/components/Logo";

/** Shareable Passport card (PNG). Contains totals only: no PNRs, names or dates of specific trips. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : undefined;
  const p = computePassport(await passportFlights(user), year);
  const t = p.totals;
  const dist = user.units === "mi" ? kmToMi(t.distanceKm) : t.distanceKm;
  const stats: [string, string][] = [
    ["FLIGHTS", fmtNumber(t.flights)],
    [user.units === "mi" ? "MILES" : "KILOMETRES", fmtNumber(dist)],
    ["IN THE AIR", fmtHours(t.durationMin)],
    ["AIRPORTS", fmtNumber(t.airports)],
    ["AIRLINES", fmtNumber(t.airlines)],
    ["COUNTRIES", fmtNumber(t.countries)],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#f3ead8", color: "#3b2f1e", fontFamily: "serif", position: "relative" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
          <path d="M-40 560 C 300 480, 700 260, 1240 60" stroke="#a8442a" strokeWidth="4" strokeDasharray="14 10" fill="none" opacity="0.55" />
          <path d="M-40 600 C 340 520, 760 320, 1240 130" stroke="#2f5d8a" strokeWidth="2" fill="none" opacity="0.35" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LogoSvg {...LOGO_COLORS.day} size={56} />
            <div style={{ fontSize: 22, letterSpacing: 8, color: "#a8442a" }}>CONTRAIL PASSPORT</div>
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, marginTop: 8 }}>{year ? `${year} in the air` : "All-time travel"}</div>
          <div style={{ fontSize: 26, color: "#8a6d45", marginTop: 8 }}>{`${fmtNumber(t.earthLaps, 1)}× around the Earth · ${fmtNumber(t.moonPct, 1)}% of the way to the Moon`}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {stats.map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", width: 340, padding: "18px 24px", borderRadius: 24, background: "#fbf6ea", border: "2px dashed #c9b48e" }}>
              <div style={{ fontSize: 52, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 18, letterSpacing: 4, color: "#8a6d45" }}>{k}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
