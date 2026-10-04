import { clearedOwnerCookie, ownerSessionCookie, passcodeMatches } from "../../lib/owner-session";
import { getRuntimeEnvironment } from "../../lib/pdf/serve";
import { assertSameOriginRequest, readJsonObject } from "../../lib/request-security";

export const dynamic = "force-dynamic";

// POST {passcode} signs the owner in; DELETE signs out. A wrong passcode
// waits a moment before answering, to slow guessing.
export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    const body = await readJsonObject(request, 1_024);
    if (!passcodeMatches(runtime, body.passcode)) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return Response.json({ error: "That passcode is not right." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": ownerSessionCookie(runtime) } });
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  assertSameOriginRequest(request);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": clearedOwnerCookie() } });
}
