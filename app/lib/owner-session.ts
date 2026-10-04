import { createHmac, timingSafeEqual } from "node:crypto";

// Owner sign-in for hosting without a signed-in user header (TripQuest's
// own Cloudflare Worker): the owner enters TRIPQUEST_OWNER_PASSCODE once at
// /owner and gets an HttpOnly cookie holding an HMAC of the passcode, never
// the passcode itself. Changing the passcode signs every browser out.

export const OWNER_COOKIE = "tripquest_owner";
const OWNER_COOKIE_DAYS = 30;

export type OwnerRuntime = { TRIPQUEST_OWNER_PASSCODE?: string };

function passcodeOf(runtime: OwnerRuntime) {
  const passcode = runtime.TRIPQUEST_OWNER_PASSCODE?.trim() ?? "";
  // Short passcodes are refused outright rather than guessable.
  return passcode.length >= 12 ? passcode : "";
}

function sessionToken(passcode: string) {
  return createHmac("sha256", passcode).update("tripquest-owner-session-v1").digest("hex");
}

function sameText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passcodeMatches(runtime: OwnerRuntime, attempt: unknown) {
  const passcode = passcodeOf(runtime);
  return Boolean(passcode) && typeof attempt === "string" && sameText(attempt.trim(), passcode);
}

export function hasOwnerSession(request: Request, runtime: OwnerRuntime) {
  const passcode = passcodeOf(runtime);
  if (!passcode) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.match(new RegExp(`(?:^|;\\s*)${OWNER_COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
  return Boolean(value) && sameText(value as string, sessionToken(passcode));
}

export function ownerSessionCookie(runtime: OwnerRuntime) {
  return `${OWNER_COOKIE}=${sessionToken(passcodeOf(runtime))}; Max-Age=${OWNER_COOKIE_DAYS * 86_400}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedOwnerCookie() {
  return `${OWNER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
