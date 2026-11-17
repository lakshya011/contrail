// Loads .env.local (then .env) for standalone scripts run with tsx.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file missing: fine */
  }
}
