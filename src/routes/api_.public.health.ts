import { createFileRoute } from "@tanstack/react-router";

/**
 * Public health probe used by the status widget in the footer.
 *
 * Deliberately privacy-clean: nothing about the caller is read, stored or
 * logged — the handler only reports whether the app can reach its Neon
 * Postgres database, how long that round-trip took, and which migration level
 * this deployment's code expects (used before applying held-back lockdowns).
 */
/** One database probe per isolate per minute, however many tabs poll (egress). */
const PROBE_TTL_MS = 60_000;
let lastProbe: { at: number; status: "operational" | "degraded"; latency: number } | null = null;

export const Route = createFileRoute("/api_/public/health")({
  server: {
    handlers: {
      GET: async () => {
        if (!lastProbe || Date.now() - lastProbe.at > PROBE_TTL_MS) {
          const started = Date.now();
          let status: "operational" | "degraded" = "operational";
          try {
            const { sql } = await import("@/lib/neon");
            await sql`SELECT 1`;
          } catch {
            status = "degraded";
          }
          lastProbe = { at: Date.now(), status, latency: Date.now() - started };
        }

        const { CODE_SCHEMA_LEVEL } = await import("@/lib/schema-version");
        return Response.json(
          { status: lastProbe.status, latency_ms: lastProbe.latency, schema: CODE_SCHEMA_LEVEL },
          { headers: { "cache-control": "public, max-age=30, s-maxage=60" } },
        );
      },
    },
  },
});
