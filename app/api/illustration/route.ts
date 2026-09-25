import { illustrationStorageKey } from "../../lib/generation/illustration-ai";
import type { BookletObjectStorage } from "../../lib/storage/booklet-storage";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = { BOOKLET_FILES?: BookletObjectStorage };

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

export async function GET(request: Request) {
  const runtime = await getRuntimeEnvironment();
  const key = illustrationStorageKey(request.url);
  if (!key || !runtime.BOOKLET_FILES) return new Response("Not found", { status: 404 });
  const stored = await runtime.BOOKLET_FILES.get(key);
  if (!stored?.arrayBuffer) return new Response("Not found", { status: 404 });
  return new Response(await stored.arrayBuffer(), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
