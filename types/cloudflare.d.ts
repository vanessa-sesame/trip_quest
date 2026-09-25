// Minimal ambient types for the Cloudflare runtime surface this app touches,
// instead of pulling in all of @cloudflare/workers-types. The app narrows
// `env` to its own RuntimeEnvironment types at each route.
declare module "cloudflare:workers" {
  export const env: unknown;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

type D1Database = unknown;
type R2Bucket = unknown;
