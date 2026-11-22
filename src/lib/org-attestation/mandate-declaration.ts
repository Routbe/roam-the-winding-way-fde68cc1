/**
 * Pure rules for the passkey-confirmed mandate declaration (layer 3 "declared", db/0300
 * rout_trust_mandate_declare). No I/O, so every rule is unit-tested.
 *
 *   challenge = SHA-256("ROUT-v1-ORG-MANDATE-DECL" 0x1f workspace 0x1f user 0x1f nonce 0x1f issuedAt)
 *   ticket    = "md1." nonce "." issuedAt "." HMAC-SHA256(key, "ROUT-v1-ORG-MANDATE-TICKET" 0x1f challenge)
 *   statement = canonical JSON (fixed key order) naming workspace, holder, entity, domain, work e-mail,
 *               nonce, issuedAt and challenge; signed as Ed25519("ROUT-v1-ORG-MANDATE-DECL" 0x1f SHA-256(statement)).
 *
 * The ticket is bound to member + workspace and lives 300 s; a used nonce is refused (NonceLedger).
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const MANDATE_DOMAIN = "ROUT-v1-ORG-MANDATE-DECL";
const TICKET_DOMAIN = "ROUT-v1-ORG-MANDATE-TICKET";
export const MANDATE_TTL_SEC = 300;
const SKEW_SEC = 5;
const SEP = "\u001f";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE = /^[0-9a-f]{32}$/;
const enc = new TextEncoder();

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function mandateChallenge(workspaceId: string, userId: string, nonce: string, issuedAtSec: number): Uint8Array {
  if (!UUID.test(workspaceId) || !UUID.test(userId) || !NONCE.test(nonce) || !Number.isSafeInteger(issuedAtSec)) {
    throw new Error("mandate_challenge_invalid");
  }
  return sha256(enc.encode([MANDATE_DOMAIN, workspaceId, userId, nonce, String(issuedAtSec)].join(SEP)));
}

function ticketMac(key: Uint8Array, challenge: Uint8Array): string {
  const msg = new Uint8Array([...enc.encode(TICKET_DOMAIN + SEP), ...challenge]);
  return hex(hmac(sha256, key, msg));
}

export function issueTicket(key: Uint8Array, workspaceId: string, userId: string, nonce: string, issuedAtSec: number): string {
  return `md1.${nonce}.${issuedAtSec}.${ticketMac(key, mandateChallenge(workspaceId, userId, nonce, issuedAtSec))}`;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export type Ticket = { nonce: string; issuedAtSec: number; challenge: Uint8Array };

/** Owner, workspace, MAC and the 300 s window; anything else is null. */
export function openTicket(key: Uint8Array, ticket: string, workspaceId: string, userId: string, nowSec: number): Ticket | null {
  const parts = ticket.split(".");
  if (parts.length !== 4 || parts[0] !== "md1") return null;
  const [, nonce = "", at = "", mac = ""] = parts;
  const issuedAtSec = Number(at);
  if (!NONCE.test(nonce) || !/^\d{1,12}$/.test(at) || !/^[0-9a-f]{64}$/.test(mac)) return null;
  if (issuedAtSec > nowSec + SKEW_SEC || nowSec - issuedAtSec >= MANDATE_TTL_SEC) return null;
  let challenge: Uint8Array;
  try { challenge = mandateChallenge(workspaceId, userId, nonce, issuedAtSec); } catch { return null; }
  if (!timingSafeHexEqual(ticketMac(key, challenge), mac)) return null;
  return { nonce, issuedAtSec, challenge };
}

/** Single-use nonces within their lifetime (per server instance; the ticket MAC and TTL hold everywhere). */
export class NonceLedger {
  private used = new Map<string, number>();
  /** true the first time a nonce is spent, false on any replay. */
  spend(nonce: string, expiresAtSec: number, nowSec: number): boolean {
    for (const [n, exp] of this.used) if (exp <= nowSec) this.used.delete(n);
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, expiresAtSec);
    return true;
  }
}

export type DeclarationFacts = {
  workspaceId: string; holderId: string; entityId: string; domain: string; workEmailId: string;
  nonce: string; issuedAtSec: number; challenge: Uint8Array;
};

/** Fixed key order; db/0300 compares v, workspace, holder, entity, domain and workEmail. */
export function canonicalStatement(f: DeclarationFacts): string {
  return JSON.stringify({
    v: "rout.mandate.declaration.v1",
    domainSeparation: MANDATE_DOMAIN,
    workspace: f.workspaceId,
    holder: f.holderId,
    entity: f.entityId,
    domain: f.domain,
    workEmail: f.workEmailId,
    nonce: f.nonce,
    issuedAt: f.issuedAtSec,
    challenge: hex(f.challenge),
  });
}

export function statementSigningMessage(digest: Uint8Array): Uint8Array {
  return new Uint8Array([...enc.encode(MANDATE_DOMAIN + SEP), ...digest]);
}
