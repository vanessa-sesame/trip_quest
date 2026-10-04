import assert from "node:assert/strict";
import test from "node:test";
import { hasOwnerSession, ownerSessionCookie, passcodeMatches } from "../app/lib/owner-session.ts";
import { isOwnerRequest } from "../app/lib/pdf/serve.ts";

const runtime = { TRIPQUEST_OWNER_PASSCODE: "correct horse battery staple" };
const live = (cookie?: string) => new Request("https://tripquestkids.com/api/orders", { headers: cookie ? { cookie } : {} });

test("the owner passcode signs a browser in with a cookie that holds no passcode", () => {
  assert.equal(passcodeMatches(runtime, "correct horse battery staple"), true);
  assert.equal(passcodeMatches(runtime, "wrong"), false);
  const cookie = ownerSessionCookie(runtime);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!cookie.includes("horse"));
  const value = cookie.split(";")[0];
  assert.equal(hasOwnerSession(live(value), runtime), true);
  assert.equal(isOwnerRequest(live(value), runtime), true);
  assert.equal(isOwnerRequest(live(`tripquest_owner=${"0".repeat(64)}`), runtime), false);
  assert.equal(isOwnerRequest(live(), runtime), false);
});

test("no passcode, or a short one, never signs anyone in", () => {
  assert.equal(passcodeMatches({}, ""), false);
  assert.equal(passcodeMatches({ TRIPQUEST_OWNER_PASSCODE: "short" }, "short"), false);
  assert.equal(hasOwnerSession(live("tripquest_owner=abc"), {}), false);
});
