// @vitest-environment node
/**
 * db/0302 on an offline replay of db/: a closed evidence review keeps no personal data,
 * evidence_purged has no actor or detail, and nl/fr/de/en are reserved. Never touches Neon.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { replayDb } from "../../scripts/formal-rls/replay";

let db: PGlite;
const WS = "00000000-0000-4000-8000-000000030201";
const U = "00000000-0000-4000-8000-000000030202";
const R = "00000000-0000-4000-8000-000000030203";

beforeAll(async () => {
  db = await replayDb(() => true);
}, 600_000);
afterAll(async () => { await db?.close(); });

describe("db/0302", () => {
  it("reserves the language prefixes nl, fr, de and en", async () => {
    const rows = (await db.query<{ h: string }>(
      "select handle_normalized as h from public.handle_registry where namespace = 'system_reserved' and handle_normalized = any($1) order by 1",
      [["nl", "fr", "de", "en"]],
    )).rows.map((r) => r.h);
    expect(rows).toEqual(["de", "en", "fr", "nl"]);
  });

  it("clears every personal field on purge and logs evidence_purged without actor or detail", async () => {
    await db.exec("set session_replication_role = replica");
    await db.query("insert into public.trust_evidence_reviews (id, workspace_id, requester_user_id, subject, evidence_kind, sha256, mime, byte_size, ciphertext, subject_nullifier, country, public_name, purge_due_at) values ($1, $2, $3, 'public_body', 'staatsblad', $4, 'application/pdf', 10, $5, $4, 'BE', 'Gemeente Test', now() + interval '1 day')",
      [R, WS, U, new Uint8Array(32).fill(7), new Uint8Array(64).fill(1)]);
    await db.exec("set session_replication_role = origin");
    await db.query("select public.rout_trust_evidence_close($1, 'rejected', 'insufficient', $2)", [R, U]);
    const row = (await db.query<Record<string, unknown>>("select * from public.trust_evidence_reviews where id = $1", [R])).rows[0]!;
    expect(row).toMatchObject({ requester_user_id: null, decided_by: null, sha256: null, subject_nullifier: null, country: null, public_name: null, ciphertext: null });
    expect(row["purged_at"]).not.toBeNull();
    const ev = (await db.query<{ actor_user_id: string | null; detail: unknown }>(
      "select actor_user_id, detail from public.workspace_trust_events where subject_id = $1 and event = 'evidence_purged'", [R])).rows;
    expect(ev).toEqual([{ actor_user_id: null, detail: {} }]);
  });
});
