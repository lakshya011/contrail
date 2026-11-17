/**
 * Spec-compliant Uint8Array.fromBase64 / Uint8Array.prototype.toBase64 for Node versions that lack them.
 *
 * Why: pdf.js (bundled in unpdf, used to read PDF e-tickets) installs its own fallback for these when
 * they are missing, and that fallback ignores the `alphabet: "base64url"` option. jose (session cookies)
 * uses these functions whenever they exist, so after the first PDF was parsed every session token failed
 * to decode and you were signed out. Installing correct versions first means pdf.js leaves them alone.
 */
type B64Options = { alphabet?: "base64" | "base64url"; omitPadding?: boolean; lastChunkHandling?: string };

const isNative = (fn: unknown) => typeof fn === "function" && /\[native code\]/.test(Function.prototype.toString.call(fn));

export function installBase64Polyfill() {
  const U = Uint8Array as unknown as { fromBase64?: unknown };
  const proto = Uint8Array.prototype as unknown as { toBase64?: unknown };

  if (!isNative(U.fromBase64)) {
    Object.defineProperty(Uint8Array, "fromBase64", {
      value(input: string, opts: B64Options = {}) {
        if (typeof input !== "string") throw new TypeError("fromBase64 expects a string");
        const url = opts.alphabet === "base64url";
        const clean = input.replace(/\s/g, "");
        if (!(url ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/).test(clean)) throw new SyntaxError("Invalid base64 string");
        return new Uint8Array(Buffer.from(clean, url ? "base64url" : "base64"));
      },
      writable: true,
      configurable: true,
    });
  }

  if (!isNative(proto.toBase64)) {
    Object.defineProperty(Uint8Array.prototype, "toBase64", {
      value(this: Uint8Array, opts: B64Options = {}) {
        const buf = Buffer.from(this.buffer, this.byteOffset, this.byteLength);
        let out = buf.toString(opts.alphabet === "base64url" ? "base64url" : "base64").replace(/=+$/, "");
        if (!opts.omitPadding) out += "=".repeat((4 - (out.length % 4)) % 4);
        return out;
      },
      writable: true,
      configurable: true,
    });
  }
}

installBase64Polyfill();
