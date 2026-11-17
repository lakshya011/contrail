import { ImageResponse } from "next/og";
import { LOGO_COLORS, LogoSvg } from "@/components/Logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone home-screen icon. Square: iOS rounds the corners itself. */
export default function AppleIcon() {
  return new ImageResponse(<LogoSvg {...LOGO_COLORS.day} rounded={false} size={180} />, size);
}
