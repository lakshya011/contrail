import { expect, it } from "vitest";
import "@/lib/base64-polyfill";
import { SignJWT, jwtVerify } from "jose";

it("session tokens still verify after the PDF reader loads", async () => {
  const key = new TextEncoder().encode("x".repeat(40));
  const before = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u").sign(key);
  const { getResolvedPDFJS } = await import("unpdf");
  await getResolvedPDFJS();
  const after = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u").sign(key);
  expect((await jwtVerify(before, key)).payload.sub).toBe("u");
  expect((await jwtVerify(after, key)).payload.sub).toBe("u");
});

it("matches Buffer for both alphabets", () => {
  const bytes = new Uint8Array([251, 255, 191, 0, 1, 2, 62, 63]);
  const U = Uint8Array as unknown as { fromBase64(s: string, o?: object): Uint8Array };
  const p = bytes as unknown as { toBase64(o?: object): string };
  expect(p.toBase64()).toBe(Buffer.from(bytes).toString("base64"));
  expect(p.toBase64({ alphabet: "base64url", omitPadding: true })).toBe(Buffer.from(bytes).toString("base64url"));
  expect([...U.fromBase64(Buffer.from(bytes).toString("base64url"), { alphabet: "base64url" })]).toEqual([...bytes]);
  expect(() => U.fromBase64("ab-_", { alphabet: "base64" })).toThrow();
});
