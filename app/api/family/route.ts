import {
  defaultFamilyWorkspace,
  normalizeFamilyWorkspace,
} from "../../family";
import type { BookletDatabase } from "../../booklet-storage";
import { assertSameOriginRequest, readJsonObject } from "../../request-security";
import { readFamilyWorkspace, writeFamilyWorkspace } from "../../family-storage";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = { DB?: BookletDatabase };

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)tripquest_family_id=([^;]+)/);
  return match?.[1] || "";
}

function familyCookie(familyId: string) {
  return `tripquest_family_id=${familyId}; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly; Secure`;
}

function response(body: unknown, familyId: string, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Set-Cookie": familyCookie(familyId),
    },
  });
}

export async function GET(request: Request) {
  const runtime = await getRuntimeEnvironment();
  const familyId = cookieValue(request) || crypto.randomUUID();
  if (!runtime.DB) return response({ familyId, workspace: defaultFamilyWorkspace() }, familyId);
  try {
    return response({ familyId, workspace: await readFamilyWorkspace(runtime.DB, familyId) }, familyId);
  } catch (error) {
    console.error("[TripQuest family read]", error);
    return response({ familyId, workspace: defaultFamilyWorkspace() }, familyId);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    const familyId = cookieValue(request) || crypto.randomUUID();
    const body = await readJsonObject(request, 16_384);
    const workspace = normalizeFamilyWorkspace(body.workspace ?? body);
    if (!runtime.DB) return response({ familyId, workspace }, familyId);
    await writeFamilyWorkspace(runtime.DB, familyId, workspace);
    return response({ familyId, workspace }, familyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Family workspace could not be saved.";
    return Response.json({ error: message }, { status: 400 });
  }
}

