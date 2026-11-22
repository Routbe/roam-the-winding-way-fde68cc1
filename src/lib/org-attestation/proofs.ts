/**
 * Pure helpers for the 3-layer organisation assurance model (db/0300). No I/O, no secrets:
 * shared by the server verifiers and their tests.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { blake3 } from "@noble/hashes/blake3.js";

const enc = new TextEncoder();

export const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;
export const NONCE_RE = /^[0-9a-f]{32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/\.$/, "");
  return DOMAIN_RE.test(d) ? d : null;
}

/** DNS name holding the proof: _rout.<domain>. */
export function txtRecordName(domain: string): string {
  return `_rout.${domain}`;
}

/** Exact TXT value / well-known proof: "<workspace_id>:<nonce>". */
export function expectedProof(workspaceId: string, nonce: string): string {
  return `${workspaceId.toLowerCase()}:${nonce.toLowerCase()}`;
}

/** TXT answers arrive quoted and possibly split in chunks; join and unquote. */
export function unquoteTxt(data: string): string {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!parts) return data.trim();
  return parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

/** 32-byte evidence digest over a labelled, canonical proof description. */
export function evidenceDigest(label: string, parts: readonly string[]): Uint8Array {
  return sha256(enc.encode([label, ...parts].join("\u001f")));
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/** Workspace-email local part check: the address must be on exactly the workspace domain. */
export function emailOnDomain(email: string, domain: string): string | null {
  const e = email.trim().toLowerCase();
  const m = /^[^\s@]{1,64}@([^\s@]{3,253})$/.exec(e);
  if (!m || m[1] !== domain) return null;
  return e;
}

// ---------------------------------------------------------------- registers

export type RegisterKind = "vat_vies" | "lei_gleif";

/** EU VAT: country prefix + national number, uppercase without separators. BE numbers are 10 digits. */
export function normalizeVat(raw: string): { country: string; number: string } | null {
  const v = raw.replace(/[\s.\-]/g, "").toUpperCase();
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(v);
  if (!m) return null;
  let [, country, number] = m as unknown as [string, string, string];
  if (country === "EL") country = "GR";
  if (country === "BE") {
    if (/^\d{9}$/.test(number)) number = `0${number}`;
    if (!/^[01]\d{9}$/.test(number)) return null;
    if (!belgianCheck(number)) return null;
  }
  return { country, number };
}

/** Belgian enterprise number: 97 - (first 8 digits mod 97) == last 2 digits. */
export function belgianCheck(number10: string): boolean {
  const base = Number(number10.slice(0, 8));
  const check = Number(number10.slice(8));
  return 97 - (base % 97) === check;
}

/** ISO 17442 LEI: 20 alphanumerics, ISO 7064 mod 97-10 equals 1. */
export function normalizeLei(raw: string): string | null {
  const l = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z0-9]{18}\d{2}$/.test(l)) return null;
  let rem = 0;
  for (const ch of l) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1 ? l : null;
}

/**
 * Organisation nullifier = BLAKE3("rout.org.v1" || kind || id || pepper). The pepper is the
 * server-only identity pepper, so a register number cannot be recovered or tested offline.
 */
export function organisationNullifier(kind: RegisterKind | "public_body", canonicalId: string, pepper: string): Uint8Array {
  if (!pepper || pepper.length < 32) throw new Error("pepper_missing");
  return blake3(enc.encode(["rout.org.v1", kind, canonicalId, pepper].join("\u001f")));
}

export function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
