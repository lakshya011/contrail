// Reproduces the sign-out bug WITHOUT the fix: pdf.js's fallback breaks jose's base64url decoding.
import { expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";

it("pdf.js fallback breaks session tokens when Node lacks Uint8Array.fromBase64", async () => {
  if (typeof (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 === "function") return; // native: not affected
  const key = new TextEncoder().encode("x".repeat(40));
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u").sign(key);
  const { getResolvedPDFJS } = await import("unpdf");
  await getResolvedPDFJS();
  await expect(jwtVerify(token, key)).rejects.toThrow();
});
