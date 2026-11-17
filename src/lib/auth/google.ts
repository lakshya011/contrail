import "server-only";
import { decodeJwt } from "jose";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPES = ["openid", "email", "profile", GMAIL_SCOPE];

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  return { id, secret };
}

export function googleAuthUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: creds().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
};

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const t = (await res.json()) as TokenResponse;
  // The id_token came straight from Google's token endpoint over TLS, so decoding without
  // re-verifying the signature is acceptable here (per OpenID Connect Core 3.1.3.7).
  const claims = t.id_token ? decodeJwt(t.id_token) : {};
  return {
    ...t,
    email: (claims.email as string | undefined)?.toLowerCase(),
    emailVerified: claims.email_verified === true,
    name: claims.name as string | undefined,
    picture: claims.picture as string | undefined,
  };
}

const accessCache = new Map<string, { token: string; exp: number }>();

/** Returns a valid access token for a stored refresh token (cached until ~1 min before expiry). */
export async function accessTokenFor(refreshToken: string): Promise<string> {
  const hit = accessCache.get(refreshToken);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      body.includes("invalid_grant")
        ? "Google access expired or was revoked. Sign out and sign in again to reconnect Gmail."
        : `Google token refresh failed: ${res.status} ${body}`,
    );
  }
  const t = (await res.json()) as TokenResponse;
  accessCache.set(refreshToken, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

export function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
