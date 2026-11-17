import { formatDate } from "@/lib/time";

/** Stamp inks and shapes. Each country always gets the same combination, so your passport looks stable. */
const INKS = ["var(--ink-red)", "var(--ink-blue)", "var(--ink-green)", "var(--ink-purple)", "var(--ink-brown)"];
const SHAPES = ["circle", "rect", "double", "dashed", "tag"] as const;

/** Short names that fit on a stamp. */
const SHORT: Record<string, string> = {
  AE: "UAE", US: "USA", GB: "UK", KR: "Korea", CZ: "Czechia", NL: "Netherlands", SA: "Saudi Arabia", NZ: "New Zealand", LK: "Sri Lanka", HK: "Hong Kong",
};

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

/** One ink stamp for a country: name, the month you first arrived, and how many flights touched it. */
export function CountryStamp({ code, name, first, count }: { code: string; name: string; first: string; count: number }) {
  const h = hash(code);
  const label = SHORT[code] ?? (name.length > 14 ? code : name);
  const ink = INKS[h % INKS.length];
  const shape = SHAPES[(h >> 3) % SHAPES.length];
  const rotate = ((h >> 6) % 25) - 12; // -12°..12°
  const round = shape === "circle" || shape === "double" || shape === "dashed";
  const size = round ? "h-[96px] w-[96px] rounded-full" : shape === "tag" ? "min-w-[104px] rounded-[18px] px-3 py-3" : "min-w-[100px] rounded-[6px] px-3 py-3";
  const border = shape === "double" ? "border-[3px] border-double" : shape === "dashed" ? "border-dashed" : "";
  return (
    <div
      className={`stamp ${size} ${border} gap-0.5 select-none`}
      style={{ color: ink, transform: `rotate(${rotate}deg)` }}
      title={`${name}: ${count} flight${count === 1 ? "" : "s"}, first on ${formatDate(first)}`}
    >
      <span className="text-[9px] tracking-[0.2em] opacity-80">{shape === "tag" ? "Arrival" : "Arrived"}</span>
      <span className={`max-w-[80px] font-semibold leading-tight ${label.length > 8 ? "text-[10px] tracking-normal" : "text-[13px]"}`}>{label}</span>
      <span className="font-mono text-[10px] normal-case">{formatDate(first, { month: "short", year: "numeric" })}</span>
      <span className="font-mono text-[10px] normal-case opacity-80">{count} flt</span>
    </div>
  );
}
