import { createFileRoute } from "@tanstack/react-router";

/**
 * Organisation trust sweep (db/0300): re-checks DNS / well-known proofs of active domain seals
 * (72 h grace on the database clock, lookup errors never lapse a seal), then expires seals and
 * mandates and purges review documents older than 7 days. Protected by cronGuard (CRON_SECRET).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;
  const { attestationSweep } = await import("@/lib/org-attestation/attestation.server");
  return Response.json({ success: true, ...(await attestationSweep()) });
}

export const Route = createFileRoute("/api_/public/cron/attestation-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
