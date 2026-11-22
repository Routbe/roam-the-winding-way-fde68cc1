// @vitest-environment node
/**
 * db/0300 rout_trust_mandate_declare on an offline replay of db/ (definer guard applied). Never touches Neon.
 * Proves that the statement written by the server code is accepted as-is, and that a declaration ticket is
 * single-use and bounded to 300 s (+5 s skew) on the database clock, independent of any server instance:
 *   - a fresh ticket declares a mandate;
 *   - the same ticket again is refused as ticket_replayed and leaves the existing mandate active;
 *   - a ticket older than 305 s or more than 5 s in the future is refused as ticket_invalid without writing;
 *   - a new ticket still re-declares, superseding the previous declaration.
 */
import { PGlite } from "@electric-sql/pglite";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyReleased, replayDb } from "../../scripts/formal-rls/replay";
import { canonicalStatement, mandateChallenge, statementSigningMessage } from "@/lib/org-attestation/mandate-declaration";

const A = "00000000-0000-4000-8000-000000003001";
const W = "00000000-0000-4000-8000-000000003002";
const DOMAIN = "acme-trust.example";
const SEED = new Uint8Array(32).fill(7);
const enc = new TextEncoder();
const b32 = (n: number) => `'\\x${n.toString(16).padStart(2, "0").repeat(32)}'::bytea`;

let db: PGlite;
let entityId = "";
let workEmailId = "";
let firstIssuedAt = 0;

beforeAll(async () => {
  // 0302 builds on 0300, so it is applied after it.
  db = await replayDb((f) => f !== "0300_organization_attestations.sql" && f !== "0302_evidence_purge_anonymous.sql");
  await applyReleased(db, "0300_organization_attestations.sql");
  await applyReleased(db, "0302_evidence_purge_anonymous.sql");
  await db.exec(`
    insert into public.users (id, email) values ('${A}', 'owner@acme-trust.example');
    insert into public.profiles (id, username, handle_grant) values ('${A}', 'acme-owner', 'root-handle-fixture') on conflict (id) do update set handle_grant = excluded.handle_grant, username = excluded.username;
    insert into public.workspaces (id, name, slug, domain) values ('${W}', 'Acme', 'acme-trust', '${DOMAIN}');
    insert into public.workspace_members (workspace_id, user_id, role) values ('${W}', '${A}', 'owner');
    insert into public.identity_verifications (user_id, is_verified, verification_provider, verified_at) values ('${A}', true, 'didit', now());
    insert into public.workspace_trust_attestations (workspace_id, layer, kind, subject_nullifier, country, evidence_digest, expires_at)
      values ('${W}', 'entity', 'vat_vies', ${b32(1)}, 'BE', ${b32(2)}, now() + interval '365 days');
    insert into public.workspace_trust_attestations (workspace_id, layer, kind, domain, evidence_digest)
      values ('${W}', 'domain', 'dns_txt', '${DOMAIN}', ${b32(3)});
    insert into public.workspace_work_emails (workspace_id, user_id, domain, email_hash, status, code_expires_at, verified_at, expires_at)
      values ('${W}', '${A}', '${DOMAIN}', ${b32(4)}, 'verified', now(), now(), now() + interval '365 days');
  `);
  entityId = (await db.query<{ id: string }>(`select id from public.workspace_trust_attestations where workspace_id = '${W}' and layer = 'entity'`)).rows[0]!.id;
  workEmailId = (await db.query<{ id: string }>(`select id from public.workspace_work_emails where workspace_id = '${W}'`)).rows[0]!.id;
}, 600_000);
afterAll(async () => { await db?.close(); });

/** Exactly what attestation.server.ts declareMandate sends, for a ticket issued at `issuedAtSec`. */
function signed(nonce: string, issuedAtSec: number) {
  const statement = canonicalStatement({
    workspaceId: W, holderId: A, entityId, domain: DOMAIN, workEmailId,
    nonce, issuedAtSec, challenge: mandateChallenge(W, A, nonce, issuedAtSec),
  });
  const digest = sha256(enc.encode(statement));
  const signature = Buffer.from(ed25519.sign(statementSigningMessage(digest), SEED)).toString("base64url");
  const kid = Buffer.from(sha256(ed25519.getPublicKey(SEED)).subarray(0, 8)).toString("hex");
  return [W, statement, digest, signature, kid] as const;
}

async function declare(args: readonly unknown[]): Promise<{ ok: boolean; id?: string; reason?: string }> {
  await db.exec("begin; set local role rout_app;");
  try {
    await db.query("select set_config('rout.current_user_id', $1, true)", [A]);
    const r = (await db.query<{ r: { ok: boolean; id?: string; reason?: string } }>(
      "select public.rout_trust_mandate_declare($1, $2, $3, $4, $5) as r", [...args])).rows[0]!.r;
    await db.exec("commit;");
    return r;
  } catch (e) {
    await db.exec("rollback;");
    throw e;
  }
}

const now = () => Math.floor(Date.now() / 1000);
const nonce = (c: string) => c.repeat(32);
const mandates = async () => (await db.query<{ status: string; n: number }>(
  `select status, count(*)::int as n from public.workspace_mandates where workspace_id = '${W}' group by status order by status`)).rows;

describe("db/0300 passkey mandate declaration", () => {
  it("accepts a fresh ticket exactly as the server signs it", async () => {
    firstIssuedAt = now();
    const r = await declare(signed(nonce("a"), firstIssuedAt));
    expect(r.ok, r.reason).toBe(true);
    expect(await mandates()).toEqual([{ status: "active", n: 1 }]);
  });

  it("refuses the same ticket a second time and leaves the existing mandate active", async () => {
    const r = await declare(signed(nonce("a"), firstIssuedAt));
    expect(r).toEqual({ ok: false, reason: "ticket_replayed" });
    expect(await mandates()).toEqual([{ status: "active", n: 1 }]);
  });

  it("refuses a ticket older than 300 s plus skew, without writing", async () => {
    expect(await declare(signed(nonce("b"), now() - 306))).toEqual({ ok: false, reason: "ticket_invalid" });
    expect(await mandates()).toEqual([{ status: "active", n: 1 }]);
  });

  it("refuses a ticket from the future, without writing", async () => {
    expect(await declare(signed(nonce("c"), now() + 60))).toEqual({ ok: false, reason: "ticket_invalid" });
    expect(await mandates()).toEqual([{ status: "active", n: 1 }]);
  });

  it("accepts a ticket near the end of its window", async () => {
    const r = await declare(signed(nonce("d"), now() - 290));
    expect(r.ok, r.reason).toBe(true);
    expect(await mandates()).toEqual([{ status: "active", n: 1 }, { status: "superseded", n: 1 }]);
  });
});
