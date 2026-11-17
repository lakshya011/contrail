import { ImageResponse } from "next/og";
import { LOGO_COLORS, LogoSvg } from "@/components/Logo";

const SIZES = new Set([192, 512]);

/** Android / installed-app icons (PNG). Square and full-bleed, so they also work as "maskable". */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const px = Number((await params).size);
  if (!SIZES.has(px)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<LogoSvg {...LOGO_COLORS.day} rounded={false} size={px} />, { width: px, height: px });
}
