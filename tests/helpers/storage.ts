// In-memory stand-ins for the Worker's D1 database (sqlite with the real
// drizzle migrations applied), its R2 bucket, and its static ASSETS.
import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type { BookletDatabase, BookletObjectStorage } from "../../app/lib/storage/booklet-storage.ts";

export function createMigratedDatabase(): BookletDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDirectory = new URL("../../drizzle/", import.meta.url);
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(new URL(filename, migrationsDirectory), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values: Array<string | number | null> = [];
      const prepared = {
        bind(...nextValues: Array<string | number | null>) {
          values = nextValues;
          return prepared;
        },
        async first<T>() {
          return (statement.get(...values) ?? null) as T | null;
        },
        async run() {
          return { meta: { changes: Number(statement.run(...values).changes) } };
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] };
        },
      };
      return prepared;
    },
  };
}

export function createMemoryArtifacts() {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();
  const storage: BookletObjectStorage = {
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      const { bytes, customMetadata } = object;
      return {
        customMetadata,
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
        async text() {
          return new TextDecoder().decode(bytes);
        },
      };
    },
    async put(key, value, options) {
      const bytes = typeof value === "string"
        ? new TextEncoder().encode(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
          : new Uint8Array(value).slice();
      objects.set(key, { bytes, customMetadata: options?.customMetadata });
      return undefined;
    },
    async delete(key) {
      objects.delete(key);
      return undefined;
    },
  };
  return { objects, storage };
}

// Serves public/ the way the ASSETS binding does, so PDFs get real fonts.
export const publicAssets = {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    try {
      return new Response(await readFile(new URL(`../../public${path}`, import.meta.url)));
    } catch {
      return new Response(null, { status: 404 });
    }
  },
};
