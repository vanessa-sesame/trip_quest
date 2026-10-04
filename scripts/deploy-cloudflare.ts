// Deploys the built site (npm run build) to TripQuest's own Cloudflare
// account as a Worker, using deploy/cloudflare.json for the account,
// database, storage, domains and plain settings. Secrets (listed in that
// file) are set separately with `wrangler secret put` and never stored here.
//
// Usage: npm run build && node --experimental-strip-types scripts/deploy-cloudflare.ts [--domains]
// --domains also attaches tripquestkids.com; without it the site deploys to
// its workers.dev address only, for testing before the switch.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type DeployConfig = {
  name: string;
  account_id: string;
  d1: { database_name: string; database_id: string };
  r2: { bucket_name: string };
  domains: string[];
  vars: Record<string, string>;
  secrets: string[];
};

const config = JSON.parse(readFileSync("deploy/cloudflare.json", "utf8")) as DeployConfig;
const builtPath = "dist/server/wrangler.json";
const built = JSON.parse(readFileSync(builtPath, "utf8")) as Record<string, unknown>;
const withDomains = process.argv.includes("--domains");

built.name = config.name;
built.topLevelName = config.name;
built.account_id = config.account_id;
built.workers_dev = true;
built.vars = { ...(built.vars as Record<string, string>), ...config.vars };
built.d1_databases = [{ binding: "DB", database_name: config.d1.database_name, database_id: config.d1.database_id }];
built.r2_buckets = [{ binding: "BOOKLET_FILES", bucket_name: config.r2.bucket_name }];
// The PDF renderer reads fonts and curated pictures from the site's own
// static files through env.ASSETS; without the binding it falls back to
// Helvetica and drawn art (a Worker cannot fetch its own workers.dev URL).
built.assets = { ...(built.assets as Record<string, unknown>), binding: "ASSETS" };
built.routes = withDomains ? config.domains.map((pattern) => ({ pattern, custom_domain: true })) : [];
writeFileSync(builtPath, `${JSON.stringify(built, null, 2)}\n`);
console.log(`Deploying ${config.name} to account ${config.account_id}${withDomains ? ` on ${config.domains.join(", ")}` : " (workers.dev only)"}`);

// Run from dist/server so wrangler does not pick up the project's
// .env.local (its Cloudflare image token would replace the OAuth login).
const result = spawnSync("npx", ["--yes", "wrangler@latest", "deploy", "--config", "wrangler.json"], { cwd: "dist/server", stdio: "inherit" });
process.exit(result.status ?? 1);
