// @vitest-environment node
/**
 * Organisation review documents must be purged at the latest 7 days after upload
 * (db/0300). Vercel Hobby runs one daily job, so that job has to run the trust sweep,
 * and only for the right scheduler secret.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.fn(async () => ({ domains: { checked: 0 }, maintenance: { purged: 1 } }));
const ok = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/org-attestation/attestation.server", () => ({ attestationSweep: sweep }));
vi.mock("@/lib/assets.server", () => ({ purgeExpiredAssets: ok }));
vi.mock("@/lib/storage/shared-files.server", () => ({ purgeExpiredSharedFiles: ok }));
vi.mock("@/lib/altcha.server", () => ({ purgeExpiredAltcha: ok }));
vi.mock("@/lib/security-code.server", () => ({ purgeExpiredSecurityCodes: ok }));
vi.mock("@/lib/subdomain-claims.server", () => ({ runDnsPropagationCheck: ok }));
vi.mock("@/lib/questions.server", () => ({ qaMaintenance: ok }));

const SECRET = "cron-secret-0123456789abcdef";

async function callDaily(headers: Record<string, string>) {
  const { Route } = await import("@/routes/api_.public.cron.cleanup-assets");
  const handlers = (Route.options as unknown as { server: { handlers: Record<string, (c: { request: Request }) => Promise<Response>> } }).server.handlers;
  return handlers["GET"]!({ request: new Request("https://rout.be/api/public/cron/cleanup-assets", { headers }) });
}

describe("the single daily job purges organisation review documents", () => {
  beforeEach(() => {
    sweep.mockClear();
    vi.stubEnv("CRON_SECRET", SECRET);
  });

  it("runs the trust sweep once per run and reports its result", async () => {
    const res = await callDaily({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect((await res.json()).organisationTrust).toEqual({ domains: { checked: 0 }, maintenance: { purged: 1 } });
  });

  it("never runs the trust sweep for a wrong secret", async () => {
    expect((await callDaily({ authorization: "Bearer wrong" })).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("a failing trust sweep does not stop the other purges", async () => {
    sweep.mockRejectedValueOnce(new Error("neon down"));
    const body = await (await callDaily({ authorization: `Bearer ${SECRET}` })).json();
    expect(body.organisationTrust).toEqual({ error: true });
    expect(body.assets).toEqual({ ok: true });
  });
});
