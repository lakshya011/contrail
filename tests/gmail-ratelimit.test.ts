import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { isRateLimitBody } = await import("@/lib/gmail/client");

it("treats Gmail's 403 quota responses as rate limits", () => {
  expect(isRateLimitBody(`{"error":{"code":403,"message":"Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'"}}`)).toBe(true);
  expect(isRateLimitBody(`{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}`)).toBe(true);
  expect(isRateLimitBody(`{"error":{"code":403,"message":"Insufficient Permission"}}`)).toBe(false);
});
