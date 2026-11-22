import { createFileRoute } from "@tanstack/react-router";

/** Ruimt verlopen Asset Manager-bestanden op (Scaleway + Neon). Header: CRON_SECRET. */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;
  const { purgeExpiredAssets } = await import("@/lib/assets.server");
  const { purgeExpiredSharedFiles } = await import("@/lib/storage/shared-files.server");
  const { purgeExpiredAltcha } = await import("@/lib/altcha.server");
  const { purgeExpiredSecurityCodes } = await import("@/lib/security-code.server");
  const { runDnsPropagationCheck } = await import("@/lib/subdomain-claims.server");
  const { qaMaintenance } = await import("@/lib/questions.server");
  const { attestationSweep } = await import("@/lib/org-attestation/attestation.server");
  // The single daily job (Vercel Hobby allows one): every purge is independent and fail-safe.
  // attestationSweep purges organisation review documents due after 7 days (db/0300).
  const [assets, sharedFiles, altcha, codes, dns, qa, trust] = await Promise.allSettled([
    purgeExpiredAssets(),
    purgeExpiredSharedFiles(),
    purgeExpiredAltcha(),
    purgeExpiredSecurityCodes(),
    runDnsPropagationCheck(),
    qaMaintenance(),
    attestationSweep(),
  ]);
  const pick = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: true });
  return Response.json({
    assets: pick(assets),
    sharedFiles: pick(sharedFiles),
    altcha: pick(altcha),
    securityCodes: pick(codes),
    dns: pick(dns),
    qaPrivacy: pick(qa),
    organisationTrust: pick(trust),
  });
}

export const Route = createFileRoute("/api_/public/cron/cleanup-assets")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
