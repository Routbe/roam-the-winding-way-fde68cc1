/**
 * Server orchestration for the organisation assurance model (db/0300). Every write goes through
 * the rout_trust_* / rout_admin_trust_* SECURITY DEFINER functions inside the caller's db context
 * (requireAuth); the database decides who manages a workspace and who is a 2FA admin.
 * Nothing here stores a register number, e-mail address or document in plain form.
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomInt, randomUUID } from "node:crypto";
import { runQuery } from "@/lib/neon";
import { identityPepper } from "@/lib/kyc/pepper.server";
import { checkDnsTxt, checkWellKnown } from "./dns-verifier.server";
import { checkLei, checkVat } from "./vies-gleif.server";
import { evidenceConfigured, openEvidence, sealEvidence, sniffMime } from "./evidence-vault.server";
import type { EvidenceMime } from "./evidence-vault.server";
import { MANDATE_TTL_SEC, NonceLedger, canonicalStatement, issueTicket, openTicket, statementSigningMessage } from "./mandate-declaration";
import { randomBytes } from "@noble/hashes/utils.js";
import { emailOnDomain, evidenceDigest, normalizeDomain, organisationNullifier, toHex } from "./proofs";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type Json = { [k: string]: JsonValue } | null;
const enc = new TextEncoder();

async function rpc(fn: string, args: unknown[]): Promise<unknown> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await runQuery(`select public.${fn}(${placeholders}) as r`, args);
  return rows[0]?.["r"] ?? null;
}

function keyed(label: string, value: string): Uint8Array {
  return hmac(sha256, enc.encode(`${label}\u001f${identityPepper()}`), enc.encode(value));
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---------------------------------------------------------------- reads

export async function trustOverview(workspaceId: string): Promise<Json> {
  const r = (await rpc("rout_trust_manage", [workspaceId])) as Json;
  return r ? { ...r, evidenceConfigured: evidenceConfigured() } : null;
}

export async function publicTrust(slug: string): Promise<Json> {
  return (await rpc("rout_public_workspace_trust", [slug.toLowerCase()])) as Json;
}

// ---------------------------------------------------------------- layer 1

export async function domainChallenge(workspaceId: string) {
  const r = (await rpc("rout_trust_domain_challenge", [workspaceId])) as { ok: boolean; domain?: string; nonce?: string; reason?: string };
  if (!r?.ok || !r.domain || !r.nonce) return { ok: false as const, reason: r?.reason ?? "unavailable" };
  return {
    ok: true as const, domain: r.domain,
    txtName: `_rout.${r.domain}`, txtValue: `${workspaceId}:${r.nonce}`,
    wellKnownUrl: `https://${r.domain}/.well-known/rout.json`,
    wellKnownBody: JSON.stringify({ rout: `${workspaceId}:${r.nonce}` }),
  };
}

export async function verifyDomain(workspaceId: string, kind: "dns_txt" | "well_known_email") {
  const c = (await rpc("rout_trust_domain_challenge", [workspaceId])) as { ok: boolean; domain?: string; nonce?: string; reason?: string };
  if (!c?.ok || !c.domain || !c.nonce) return { ok: false as const, reason: c?.reason ?? "unavailable" };
  const domain = normalizeDomain(c.domain);
  if (!domain) return { ok: false as const, reason: "invalid_domain" };
  const proof = kind === "dns_txt" ? await checkDnsTxt(domain, workspaceId, c.nonce) : await checkWellKnown(domain, workspaceId, c.nonce);
  if (proof.status !== "present") return { ok: false as const, reason: proof.reason };
  const evidence = evidenceDigest(`rout.org.domain.${kind}.v1`, [workspaceId, domain, c.nonce, new Date().toISOString().slice(0, 10)]);
  const r = (await rpc("rout_trust_attest_domain", [workspaceId, kind, c.nonce, evidence])) as { ok: boolean; reason?: string };
  return r?.ok ? { ok: true as const } : { ok: false as const, reason: r?.reason ?? "failed" };
}

export async function startWorkEmail(workspaceId: string, email: string, language: string) {
  const m = (await rpc("rout_trust_manage", [workspaceId])) as { domain?: string | null } | null;
  if (!m) return { ok: false as const, reason: "not_manager" };
  const domain = m.domain ? normalizeDomain(m.domain) : null;
  if (!domain) return { ok: false as const, reason: "no_domain" };
  const address = emailOnDomain(email, domain);
  if (!address) return { ok: false as const, reason: "wrong_domain" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const r = (await rpc("rout_trust_work_email_start", [
    workspaceId, keyed("rout.trust.email.v1", address), keyed("rout.trust.code.v1", `${workspaceId}:${code}`),
  ])) as { ok: boolean; reason?: string };
  if (!r?.ok) return { ok: false as const, reason: r?.reason ?? "failed" };
  const { sendMail } = await import("@/emails/send.server");
  const sent = await sendMail({
    to: address,
    subject: language === "nl" ? `ROUT-code: ${code}` : `ROUT code: ${code}`,
    text: language === "nl"
      ? `Je bevestigingscode voor het werkadres op ${domain} is ${code}. De code is 15 minuten geldig.`
      : `Your confirmation code for the work address on ${domain} is ${code}. It is valid for 15 minutes.`,
  });
  return sent.sent ? { ok: true as const } : { ok: false as const, reason: "mail_failed" };
}

export async function confirmWorkEmail(workspaceId: string, code: string) {
  const r = (await rpc("rout_trust_work_email_confirm", [workspaceId, keyed("rout.trust.code.v1", `${workspaceId}:${code}`)])) as { ok: boolean; reason?: string };
  return r?.ok ? { ok: true as const } : { ok: false as const, reason: r?.reason ?? "failed" };
}

// ---------------------------------------------------------------- layer 2

export async function attestRegister(workspaceId: string, kind: "vat_vies" | "lei_gleif", number: string, publishName: boolean) {
  const pepper = identityPepper();
  const res = kind === "vat_vies" ? await checkVat(number, pepper) : await checkLei(number, pepper);
  if (!res.ok) return { ok: false as const, reason: res.reason };
  const r = (await rpc("rout_trust_attest_entity", [
    workspaceId, res.kind, res.nullifier, res.country, res.evidence, publishName ? res.name : null,
  ])) as { ok: boolean; reason?: string };
  return r?.ok ? { ok: true as const, name: res.name, country: res.country } : { ok: false as const, reason: r?.reason ?? "failed" };
}

export async function revokeRegister(workspaceId: string) {
  return { ok: Boolean(await rpc("rout_trust_revoke_entity", [workspaceId])) };
}

// ---------------------------------------------------------------- evidence (layer 2 public body / layer 3 proven)

export interface EvidenceInput {
  workspaceId: string;
  subject: "public_body" | "mandate_proven";
  kind: "kbo_extract" | "staatsblad" | "appointment_decision" | "qes_mandate";
  mime: EvidenceMime;
  bytes: Uint8Array;
  publicBodyId?: string;
  country?: string;
  publicName?: string;
}

export async function submitEvidence(input: EvidenceInput) {
  let sealedOut: { sealed: Uint8Array; sha256: Uint8Array };
  let nullifier: Uint8Array | null = null;
  const id = randomUUID();
  try {
    if (!evidenceConfigured()) return { ok: false as const, reason: "evidence_not_configured" };
    if (sniffMime(input.bytes) !== input.mime) return { ok: false as const, reason: "file_type_mismatch" };
    if (input.subject === "public_body") {
      if (!input.publicBodyId || !input.country) return { ok: false as const, reason: "invalid" };
      nullifier = organisationNullifier("public_body", `${input.country}:${input.publicBodyId.replace(/\s/g, "").toUpperCase()}`, identityPepper());
    }
    sealedOut = sealEvidence(input.workspaceId, id, input.bytes);
  } finally {
    input.bytes.fill(0); // plaintext never outlives this call: refused, failed or sealed
  }
  const { sealed, sha256: digest } = sealedOut;
  const r = (await rpc("rout_trust_evidence_submit", [
    id, input.workspaceId, input.subject, input.kind, digest, input.mime, sealed.length - 32, sealed,
    nullifier, input.subject === "public_body" ? input.country : null, input.publicName ?? null,
  ])) as { ok: boolean; reason?: string };
  return r?.ok ? { ok: true as const, id } : { ok: false as const, reason: r?.reason ?? "failed" };
}

export async function withdrawEvidence(id: string) {
  return { ok: Boolean(await rpc("rout_trust_evidence_withdraw", [id])) };
}

// ---------------------------------------------------------------- admin

export async function adminReviews() {
  return (await rpc("rout_admin_trust_reviews", [])) as JsonValue[] | null;
}

/** SHA-256 of the Sudo Mode session id: the audit row names the exact passkey step-up, never the id. */
export function sudoReference(sudoJti: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{22}$/.test(sudoJti)) throw new Error("sudo_reference_invalid");
  return sha256(enc.encode(`rout.trust.sudo_ref.v1\u001f${sudoJti}`));
}

/** The append-only hash chain must be intact before any admin decision is written on top of it. */
export async function auditChainIntact(): Promise<boolean> {
  const broken = await rpc("rout_trust_events_verify", []);
  return broken === null;
}

/** Opens one document for the admin view; returned as base64 and never stored. */
export async function adminOpenEvidence(id: string, sudoJti: string) {
  const r = (await rpc("rout_admin_trust_evidence_open", [id, sudoReference(sudoJti)])) as
    { id: string; workspaceId: string; mime: string; sha256: string; ciphertext: string } | null;
  if (!r) return null;
  const sealed = Uint8Array.from(Buffer.from(r.ciphertext, "base64"));
  const pt = openEvidence(r.workspaceId, r.id, sealed, fromHex(r.sha256));
  try {
    return { mime: r.mime, sha256: r.sha256, base64: Buffer.from(pt).toString("base64") };
  } finally {
    pt.fill(0);
    sealed.fill(0);
  }
}

export async function adminDecide(id: string, approve: boolean, code: string | null, sudoJti: string) {
  if (!(await auditChainIntact())) return { result: "audit_chain_broken" };
  return { result: String(await rpc("rout_admin_trust_evidence_decide", [id, approve, code, sudoReference(sudoJti)])) };
}

// ---------------------------------------------------------------- layer 3: passkey-confirmed declaration

const declarationNonces = new NonceLedger();
const nowSec = () => Math.floor(Date.now() / 1000);

function subjectMaster(): string | null {
  const master = process.env["ROUT_SUBJECT_MASTER_KEY"] ?? "";
  return master.length >= 32 ? master : null;
}

/** Ticket MAC key and Ed25519 declaration seed, each HKDF'd under its own label; wiped by the caller. */
function declarationKeys(): { mac: Uint8Array; seed: Uint8Array } | null {
  const master = subjectMaster();
  if (!master) return null;
  const ikm = enc.encode(master);
  return {
    mac: hkdf(sha256, ikm, enc.encode("rout.org_mandate.ticket"), enc.encode("hmac-sha256.v1"), 32),
    seed: hkdf(sha256, ikm, enc.encode("rout.org_mandate.declaration"), enc.encode("ed25519.v1"), 32),
  };
}

type ManageFacts = {
  domain?: string | null;
  domainSeal?: { kind: string } | null;
  entity?: { id: string } | null;
  workEmail?: { id: string; status: string } | null;
  legalIdentity?: boolean;
};

function declarationBlocker(m: ManageFacts | null): string | null {
  if (!m) return "not_manager";
  if (!m.legalIdentity) return "legal_identity_required";
  if (!m.entity) return "organization_required";
  if (!m.domainSeal || m.domainSeal.kind !== "dns_txt" || !m.domain) return "dns_required";
  if (!m.workEmail || m.workEmail.status !== "verified") return "work_email_required";
  return null;
}

/** Step 1: a 300 s single-use ticket bound to member + workspace (no database write). */
export async function startMandateDeclaration(workspaceId: string, userId: string) {
  const blocker = declarationBlocker((await rpc("rout_trust_manage", [workspaceId])) as ManageFacts | null);
  if (blocker) return { ok: false as const, reason: blocker };
  const keys = declarationKeys();
  if (!keys) return { ok: false as const, reason: "declaration_not_configured" };
  try {
    const nonce = toHex(randomBytes(16));
    return { ok: true as const, ticket: issueTicket(keys.mac, workspaceId, userId, nonce, nowSec()) };
  } finally {
    keys.mac.fill(0); keys.seed.fill(0);
  }
}

/** Step 2 (behind Sudo Mode, i.e. a fresh passkey assertion): verify, spend, sign, store. */
export async function declareMandate(workspaceId: string, userId: string, ticket: string) {
  const keys = declarationKeys();
  if (!keys) return { ok: false as const, reason: "declaration_not_configured" };
  try {
    const now = nowSec();
    const t = openTicket(keys.mac, ticket, workspaceId, userId, now);
    if (!t) return { ok: false as const, reason: "ticket_invalid" };
    if (!declarationNonces.spend(t.nonce, t.issuedAtSec + MANDATE_TTL_SEC, now)) return { ok: false as const, reason: "ticket_replayed" };
    const m = (await rpc("rout_trust_manage", [workspaceId])) as ManageFacts | null;
    const blocker = declarationBlocker(m);
    if (blocker || !m?.entity || !m.workEmail || !m.domain) return { ok: false as const, reason: blocker ?? "invalid" };
    const statement = canonicalStatement({
      workspaceId, holderId: userId, entityId: m.entity.id, domain: m.domain, workEmailId: m.workEmail.id,
      nonce: t.nonce, issuedAtSec: t.issuedAtSec, challenge: t.challenge,
    });
    const digest = sha256(enc.encode(statement));
    const { ed25519 } = await import("@noble/curves/ed25519.js");
    const signature = b64url(ed25519.sign(statementSigningMessage(digest), keys.seed));
    const kid = toHex(sha256(ed25519.getPublicKey(keys.seed)).subarray(0, 8));
    const r = (await rpc("rout_trust_mandate_declare", [workspaceId, statement, digest, signature, kid])) as { ok: boolean; id?: string; reason?: string };
    return r?.ok ? { ok: true as const, id: r.id } : { ok: false as const, reason: r?.reason ?? "failed" };
  } finally {
    keys.mac.fill(0); keys.seed.fill(0);
  }
}

function b64url(b: Uint8Array): string {
  return Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------- cron

/** DNS re-check of active domain seals, then the time-based maintenance (expiry, 7-day purge). */
/** Batches of at most 50 seals per run; the definer returns only id, workspace, domain, kind and nonce. */
export async function attestationSweep(limit = 50) {
  const list = (await rpc("rout_trust_domain_sweep", [limit])) as Array<{ id: string; workspaceId: string; domain: string; kind: string; nonce: string }>;
  const tally = { checked: 0, ok: 0, failing: 0, lapsed: 0, skipped: 0 };
  for (const s of list ?? []) {
    const proof = s.kind === "dns_txt" ? await checkDnsTxt(s.domain, s.workspaceId, s.nonce) : await checkWellKnown(s.domain, s.workspaceId, s.nonce);
    tally.checked++;
    if (proof.status === "error") { tally.skipped++; continue; } // lookup failures never lapse a seal
    const out = String(await rpc("rout_trust_domain_report", [s.id, proof.status === "present"]));
    if (out === "ok") tally.ok++; else if (out === "failing") tally.failing++; else if (out === "lapsed") tally.lapsed++;
  }
  const maintenance = (await rpc("rout_trust_maintenance", [])) as JsonValue;
  return { domains: tally, maintenance };
}

export { toHex };
