import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.fn(async () => ({ domains: { checked: 0 }, maintenance: null }));
const runQuery = vi.fn(async () => ({ rows: [{ r: { ok: true } }] }));

vi.mock("@/lib/org-attestation/attestation.server", async (orig) => ({
  ...(await orig<typeof import("./attestation.server")>()),
  attestationSweep: sweep,
}));
vi.mock("@/lib/neon", () => ({ runQuery }));

const WS = "11111111-2222-4333-8444-555555555555";
const SECRET = "cron-secret-0123456789abcdef";

async function callSweep(headers: Record<string, string>, method: "GET" | "POST" = "POST") {
  const { Route } = await import("@/routes/api_.public.cron.attestation-sweep");
  const handlers = (Route.options as unknown as { server: { handlers: Record<string, (c: { request: Request }) => Promise<Response>> } }).server.handlers;
  return handlers[method]!({ request: new Request("https://rout.be/api/public/cron/attestation-sweep", { method, headers }) });
}

describe("organisation trust sweep refuses wrong scheduler passwords", () => {
  beforeEach(() => {
    sweep.mockClear();
    vi.stubEnv("CRON_SECRET", SECRET);
  });
  it("answers 401 to a wrong or missing secret and never runs the sweep", async () => {
    expect((await callSweep({ authorization: "Bearer wrong-secret" })).status).toBe(401);
    expect((await callSweep({ "x-cron-secret": `${SECRET}x` })).status).toBe(401);
    expect((await callSweep({}, "GET")).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("answers 503 when no secret is configured, and never runs the sweep", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await callSweep({ authorization: `Bearer ${SECRET}` })).status).toBe(503);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("runs the sweep for the right secret", async () => {
    expect((await callSweep({ authorization: `Bearer ${SECRET}` })).status).toBe(200);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe("review documents never outlive the upload call", () => {
  beforeEach(() => vi.unstubAllEnvs());
  const upload = (mime: "application/pdf" | "image/png", bytes: Uint8Array) =>
    ({ workspaceId: WS, subject: "mandate_proven" as const, kind: "kbo_extract" as const, mime, bytes });

  it("wipes the bytes when evidence storage is not configured", async () => {
    const { submitEvidence } = await import("./attestation.server");
    const bytes = new TextEncoder().encode("%PDF-1.7 secret\n%%EOF");
    expect(await submitEvidence(upload("application/pdf", bytes))).toEqual({ ok: false, reason: "evidence_not_configured" });
    expect(bytes.every((b) => b === 0)).toBe(true);
  });
  it("wipes the bytes when the file type does not match", async () => {
    vi.stubEnv("ROUT_EVIDENCE_KEK", "A".repeat(64));
    const { submitEvidence } = await import("./attestation.server");
    const bytes = new TextEncoder().encode("%PDF-1.7 secret\n%%EOF");
    expect(await submitEvidence(upload("image/png", bytes))).toEqual({ ok: false, reason: "file_type_mismatch" });
    expect(bytes.every((b) => b === 0)).toBe(true);
  });
});

describe("db/0300 mandate declaration is single-use on the database clock", () => {
  const sql = readFileSync("db/0300_organization_attestations.sql", "utf8");
  const declare = sql.slice(sql.indexOf("function public.rout_trust_mandate_declare("), sql.indexOf("revoke all on function public.rout_trust_mandate_declare("));

  it("keeps one declared mandate per statement digest across all servers", () => {
    expect(sql).toMatch(/create unique index if not exists workspace_mandates_declared_digest_once on public\.workspace_mandates \(statement_digest\) where level = 'declared';/);
  });
  it("refuses a ticket older than 300 s (+5 s skew) or from the future", () => {
    expect(declare).toContain("pg_catalog.clock_timestamp()))::bigint - 305");
    expect(declare).toContain("pg_catalog.clock_timestamp()))::bigint + 5");
  });
  it("refuses a replay before any existing mandate is superseded", () => {
    const replay = declare.indexOf("'ticket_replayed'");
    const supersede = declare.indexOf("perform public.rout_trust_end_mandates(");
    expect(replay).toBeGreaterThan(0);
    expect(replay).toBeLessThan(supersede);
  });
});
