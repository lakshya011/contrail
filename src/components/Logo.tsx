/**
 * Contrail logo (concept 3f): a full-bleed passport cover, a gold globe and a dashed route ending in a plane.
 * Plain SVG so it works in the page (themed through CSS variables) and in image routes (explicit colours).
 */
export const LOGO_COLORS = {
  day: { tile: "#16263f", gold: "#d8b46a" },
  night: { tile: "#22385a", gold: "#e6c27e" },
};

type Props = {
  tile?: string;
  gold?: string;
  /** Rounded tile for in-app use; square for platform icons that apply their own mask. */
  rounded?: boolean;
  /** Fewer, thicker lines for tiny sizes (browser tab). */
  simple?: boolean;
  size?: number | string;
  className?: string;
  title?: string;
};

/** SVG paint attributes don't accept var(); themed colours go through style instead. */
const fillOf = (c: string) => (c.startsWith("var(") ? { style: { fill: c } } : { fill: c });
const strokeOf = (c: string) => (c.startsWith("var(") ? { fill: "none", style: { stroke: c } } : { fill: "none", stroke: c });

export function LogoSvg({ tile = "var(--logo-tile)", gold = "var(--logo-gold)", rounded = true, simple = false, size, className, title }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="100" height="100" rx={rounded ? 22 : 0} {...fillOf(tile)} />
      {simple ? (
        <>
          <circle cx="50" cy="50" r="23" {...strokeOf(gold)} strokeWidth="9" />
          <path d="M20 76 Q50 30 84 20" {...strokeOf(gold)} strokeWidth="8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="50" cy="48" r="20" {...strokeOf(gold)} strokeWidth="2.6" />
          <ellipse cx="50" cy="48" rx="8.5" ry="20" {...strokeOf(gold)} strokeWidth="1.6" />
          <line x1="30" y1="48" x2="70" y2="48" {...strokeOf(gold)} strokeWidth="1.6" />
          <path d="M24 70 Q50 26 80 22" {...strokeOf(gold)} strokeWidth="2.6" strokeDasharray="4 3" strokeLinecap="round" />
          <path d="M75 17.5 L82 21.5 L77.5 27.5" {...strokeOf(gold)} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
