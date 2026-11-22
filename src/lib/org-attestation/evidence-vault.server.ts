/**
 * Short-lived sealing of mandate/public-body evidence (KBO extract, Staatsblad, ...) for the
 * admin review queue (db/0300 trust_evidence_reviews). AES-256-GCM under ROUT_EVIDENCE_KEK
 * (read per call, never at module scope); the AES key is HKDF-derived from the KEK.
 *
 *   sealed = "REV1" || nonce(12) || ciphertext || tag(16)
 *   AAD    = "rout:org_evidence:v1:" || workspaceId || ":" || reviewId || 0x1f || sha256(plaintext)
 *
 * Workspace and review id (chosen by the server) are bound into the AAD with a fresh 96-bit
 * CSPRNG nonce per file, so a ciphertext moved to another workspace or dossier does not open.
 * Every failure is the same EvidenceVaultError (no oracle).
 */
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

const KEK_RE = /^[A-Za-z0-9]{40,512}$/; // 40+ alphanumerics ≈ 238+ bits
const MAGIC = Uint8Array.of(0x52, 0x45, 0x56, 0x31); // "REV1"
const MAGIC2 = Uint8Array.of(0x52, 0x45, 0x56, 0x32); // "REV2"
const KID_LEN = 8;
const NONCE_LEN = 12;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;
export type EvidenceMime = (typeof ALLOWED_MIME)[number];

export class EvidenceVaultError extends Error {
  constructor() { super("evidence_vault_error"); this.name = "EvidenceVaultError"; }
}

const enc = new TextEncoder();

function deriveKey(env: Record<string, string | undefined>): Uint8Array {
  const kek = env["ROUT_EVIDENCE_KEK"];
  if (!kek || !KEK_RE.test(kek)) throw new EvidenceVaultError();
  return hkdf(sha256, enc.encode(kek), enc.encode("rout.trust.evidence.salt.v1"), enc.encode("rout.trust.evidence.key.v1"), 32);
}

export function evidenceConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const kek = env["ROUT_EVIDENCE_KEK"];
  return typeof kek === "string" && KEK_RE.test(kek);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function aad(workspaceId: string, reviewId: string, digest: Uint8Array): Uint8Array {
  const ws = workspaceId.toLowerCase();
  const id = reviewId.toLowerCase();
  if (!UUID_RE.test(ws) || !UUID_RE.test(id)) throw new EvidenceVaultError();
  const head = enc.encode(`rout:org_evidence:v1:${ws}:${id}\u001f`);
  const out = new Uint8Array(head.length + digest.length);
  out.set(head); out.set(digest, head.length);
  return out;
}

// Markup or executable headers inside the first KiB mark a polyglot (a file that is also HTML/SVG/script).
const POLYGLOT = /<(?:!doctype|html|head|body|script|svg|iframe|object|embed)\b|javascript:/i;

function looksPolyglot(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 1024)));
  return POLYGLOT.test(head);
}

/** A PDF must also end with its %%EOF trailer (within the last KiB). */
function pdfTrailerOk(bytes: Uint8Array): boolean {
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 1024)));
  return tail.includes("%%EOF");
}

// Active PDF content: scripts, launch/submit/import actions, embedded files, rich media and XFA forms.
// Name escapes (/J#61vaScript) are decoded first. Content inside compressed object streams is not
// inflated here, so this narrows the attack surface; the admin viewer stays sandboxed regardless.
const PDF_ACTIVE = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData)(?![A-Za-z0-9_.+-])/;
const latin1 = new TextDecoder("latin1");

export function pdfHasActiveContent(bytes: Uint8Array): boolean {
  const text = latin1.decode(bytes).replace(/\/[^\s/[\]<>(){}%]*#[^\s/[\]<>(){}%]*/g, (name) =>
    name.replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  return PDF_ACTIVE.test(text);
}

/**
 * Recognises the file by its magic bytes only (never extension or Content-Type); the declared type
 * must match. Polyglots (markup in the first KiB), PDFs without a trailer and PDFs with active
 * content (scripts, launch actions, embedded files, XFA) are refused.
 */
export function sniffMime(bytes: Uint8Array): EvidenceMime | null {
  if (bytes.length < 3 || looksPolyglot(bytes)) return null;
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return pdfTrailerOk(bytes) && !pdfHasActiveContent(bytes) ? "application/pdf" : null;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Key id of a KEK: first 8 bytes of SHA-256 over a domain-separated label (never the key itself). */
function kekId(kek: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([...enc.encode("rout.trust.evidence.kid.v2\u001f"), ...kek])).subarray(0, KID_LEN);
}

function wrapKey(kek: string): Uint8Array {
  return hkdf(sha256, enc.encode(kek), enc.encode("rout.trust.evidence.salt.v2"), enc.encode("rout.trust.evidence.wrap.v2"), 32);
}

/** Current KEK first, then the previous one during a rotation window. */
function keks(env: Record<string, string | undefined>): string[] {
  return [env["ROUT_EVIDENCE_KEK"], env["ROUT_EVIDENCE_KEK_PREVIOUS"]].filter((k): k is string => typeof k === "string" && KEK_RE.test(k));
}

/**
 * REV2: every file gets its own random 256-bit data key (DEK). The DEK is wrapped with AES-256-GCM
 * under a key derived from ROUT_EVIDENCE_KEK, which lives only in the server environment, never in Neon.
 *
 *   sealed = "REV2" || kid(8) || wnonce(12) || wrappedDek(32+16) || nonce(12) || ciphertext || tag(16)
 *
 * The purge removes the whole blob (wrapped DEK included) from the live row. A copy in Neon's
 * point-in-time history still holds the wrapped DEK, so it stays openable for as long as the KEK
 * with that kid exists: rotate ROUT_EVIDENCE_KEK and destroy the old one once 7 days plus Neon's
 * history retention have passed, or those copies age out only with that retention.
 */
export function sealEvidence(workspaceId: string, reviewId: string, plaintext: Uint8Array, env: Record<string, string | undefined> = process.env): { sealed: Uint8Array; sha256: Uint8Array } {
  if (plaintext.length < 1 || plaintext.length > MAX_EVIDENCE_BYTES) throw new EvidenceVaultError();
  const kek = env["ROUT_EVIDENCE_KEK"];
  if (!kek || !KEK_RE.test(kek)) throw new EvidenceVaultError();
  const wk = wrapKey(kek);
  const dek = randomBytes(32);
  try {
    const digest = sha256(plaintext);
    const a = aad(workspaceId, reviewId, digest);
    const kid = kekId(enc.encode(kek));
    const wnonce = randomBytes(NONCE_LEN);
    const wrapped = gcm(wk, wnonce, new Uint8Array([...a, ...kid])).encrypt(dek);
    const nonce = randomBytes(NONCE_LEN);
    const ct = gcm(dek, nonce, a).encrypt(plaintext);
    const parts = [MAGIC2, kid, wnonce, wrapped, nonce, ct];
    const sealed = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) { sealed.set(x, o); o += x.length; }
    return { sealed, sha256: digest };
  } finally {
    wk.fill(0); dek.fill(0);
  }
}

function checkDigest(pt: Uint8Array, expected: Uint8Array): void {
  const d = sha256(pt);
  let diff = d.length ^ expected.length;
  for (let i = 0; i < d.length; i++) diff |= d[i]! ^ (expected[i] ?? 0);
  if (diff !== 0) { pt.fill(0); throw new EvidenceVaultError(); }
}

function startsWith(b: Uint8Array, m: Uint8Array): boolean {
  for (let i = 0; i < m.length; i++) if (b[i] !== m[i]) return false;
  return true;
}

export function openEvidence(workspaceId: string, reviewId: string, sealed: Uint8Array, expectedSha256: Uint8Array, env: Record<string, string | undefined> = process.env): Uint8Array {
  try {
    const a = aad(workspaceId, reviewId, expectedSha256);
    if (startsWith(sealed, MAGIC2)) {
      const head = MAGIC2.length;
      if (sealed.length < head + KID_LEN + NONCE_LEN + 48 + NONCE_LEN + 17) throw new EvidenceVaultError();
      const kid = sealed.subarray(head, head + KID_LEN);
      const wnonce = sealed.subarray(head + KID_LEN, head + KID_LEN + NONCE_LEN);
      const wrapped = sealed.subarray(head + KID_LEN + NONCE_LEN, head + KID_LEN + NONCE_LEN + 48);
      const body = head + KID_LEN + NONCE_LEN + 48;
      const kek = keks(env).find((k) => startsWith(kekId(enc.encode(k)), kid));
      if (!kek) throw new EvidenceVaultError();
      const wk = wrapKey(kek);
      let dek: Uint8Array | undefined;
      try {
        dek = gcm(wk, wnonce, new Uint8Array([...a, ...kid])).decrypt(wrapped);
        const pt = gcm(dek, sealed.subarray(body, body + NONCE_LEN), a).decrypt(sealed.subarray(body + NONCE_LEN));
        checkDigest(pt, expectedSha256);
        return pt;
      } finally {
        wk.fill(0); dek?.fill(0);
      }
    }
    // REV1 (shared derived key): still opened for reviews filed before 0302 until they purge.
    if (sealed.length < MAGIC.length + NONCE_LEN + 17 || !startsWith(sealed, MAGIC)) throw new EvidenceVaultError();
    const key = deriveKey(env);
    try {
      const pt = gcm(key, sealed.subarray(MAGIC.length, MAGIC.length + NONCE_LEN), a).decrypt(sealed.subarray(MAGIC.length + NONCE_LEN));
      checkDigest(pt, expectedSha256);
      return pt;
    } finally {
      key.fill(0);
    }
  } catch {
    throw new EvidenceVaultError();
  }
}
