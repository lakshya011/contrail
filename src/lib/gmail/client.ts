import "server-only";
import { accessTokenFor } from "@/lib/auth/google";
import { decrypt } from "@/lib/crypto";
import type { User } from "@/db/schema";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailClient {
  constructor(private refreshToken: string) {}

  static forUser(user: User): GmailClient {
    if (!user.googleRefreshToken) throw new Error("Gmail is not connected. Sign in with Google to connect it.");
    return new GmailClient(decrypt(user.googleRefreshToken));
  }

  /**
   * GET with retry. Gmail reports its per-user quota as 403 ("Quota exceeded" / rateLimitExceeded) as well
   * as 429, so both pause every request in this process together (a shared cooldown) and then retry.
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = `${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
    for (let attempt = 0; ; attempt++) {
      await waitForCooldown();
      const token = await accessTokenFor(this.refreshToken);
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.ok) {
        cooldownStep = 0;
        return (await res.json()) as T;
      }
      const body = await res.text();
      const rateLimited = res.status === 429 || (res.status === 403 && isRateLimitBody(body));
      if (rateLimited && attempt < 8) {
        startCooldown();
        continue;
      }
      if (res.status >= 500 && attempt < 5) {
        await sleep(500 * 2 ** attempt + Math.random() * 250);
        continue;
      }
      throw new Error(`Gmail ${path} failed: ${res.status} ${body.slice(0, 300)}`);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isRateLimitBody(body: string) {
  return /quota exceeded|rateLimitExceeded|userRateLimitExceeded|too many concurrent/i.test(body);
}

// Shared across all requests in this server process.
let cooldownUntil = 0;
let cooldownStep = 0;

function startCooldown() {
  // 10s, 20s, 40s, then 60s while Google keeps saying "slow down".
  const wait = Math.min(60_000, 10_000 * 2 ** cooldownStep);
  cooldownStep = Math.min(cooldownStep + 1, 3);
  cooldownUntil = Math.max(cooldownUntil, Date.now() + wait + Math.random() * 1000);
}

async function waitForCooldown() {
  const wait = cooldownUntil - Date.now();
  if (wait > 0) await sleep(wait);
}
