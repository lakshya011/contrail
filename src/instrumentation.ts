export async function register() {
  // Install correct base64 helpers once at server start, before pdf.js can install broken ones.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/base64-polyfill");
}
