import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  MANDATE_DOMAIN, MANDATE_TTL_SEC, NonceLedger, canonicalStatement, issueTicket, mandateChallenge, openTicket, statementSigningMessage,
} from "./mandate-declaration";

const WS = "11111111-2222-4333-8444-555555555555";
const USER = "aaaaaaaa-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const NONCE = "0123456789abcdef0123456789abcdef";
const KEY = new Uint8Array(32).fill(7);
const T0 = 1_800_000_000;

describe("mandate declaration challenge", () => {
  it("is SHA-256 over the domain-separated tuple", () => {
    const expected = sha256(new TextEncoder().encode([MANDATE_DOMAIN, WS, USER, NONCE, String(T0)].join("\u001f")));
    expect(Buffer.from(mandateChallenge(WS, USER, NONCE, T0)).equals(Buffer.from(expected))).toBe(true);
    expect(MANDATE_DOMAIN).toBe("ROUT-v1-ORG-MANDATE-DECL");
  });
  it("differs per workspace, member, nonce and time", () => {
    const base = Buffer.from(mandateChallenge(WS, USER, NONCE, T0)).toString("hex");
    expect(Buffer.from(mandateChallenge(OTHER, USER, NONCE, T0)).toString("hex")).not.toBe(base);
    expect(Buffer.from(mandateChallenge(WS, OTHER, NONCE, T0)).toString("hex")).not.toBe(base);
    expect(Buffer.from(mandateChallenge(WS, USER, "f".repeat(32), T0)).toString("hex")).not.toBe(base);
    expect(Buffer.from(mandateChallenge(WS, USER, NONCE, T0 + 1)).toString("hex")).not.toBe(base);
  });
});

describe("mandate ticket", () => {
  const ticket = issueTicket(KEY, WS, USER, NONCE, T0);
  it("opens for the same member and workspace within 300 s", () => {
    expect(openTicket(KEY, ticket, WS, USER, T0 + MANDATE_TTL_SEC - 1)?.nonce).toBe(NONCE);
  });
  it("expires after exactly 300 s", () => {
    expect(openTicket(KEY, ticket, WS, USER, T0 + MANDATE_TTL_SEC)).toBeNull();
  });
  it("is refused for another member, another workspace or another key", () => {
    expect(openTicket(KEY, ticket, WS, OTHER, T0)).toBeNull();
    expect(openTicket(KEY, ticket, OTHER, USER, T0)).toBeNull();
    expect(openTicket(new Uint8Array(32).fill(8), ticket, WS, USER, T0)).toBeNull();
  });
  it("is refused when tampered or stamped in the future", () => {
    expect(openTicket(KEY, ticket.replace(NONCE, "f".repeat(32)), WS, USER, T0)).toBeNull();
    expect(openTicket(KEY, issueTicket(KEY, WS, USER, NONCE, T0 + 60), WS, USER, T0)).toBeNull();
    expect(openTicket(KEY, "md1.x.y.z", WS, USER, T0)).toBeNull();
  });
});

describe("nonce ledger", () => {
  it("spends a nonce once and refuses a replay", () => {
    const l = new NonceLedger();
    expect(l.spend(NONCE, T0 + 300, T0)).toBe(true);
    expect(l.spend(NONCE, T0 + 300, T0 + 10)).toBe(false);
  });
});

describe("canonical statement", () => {
  const facts = { workspaceId: WS, holderId: USER, entityId: OTHER, domain: "example.be", workEmailId: OTHER, nonce: NONCE, issuedAtSec: T0, challenge: mandateChallenge(WS, USER, NONCE, T0) };
  it("names exactly what db/0300 compares", () => {
    const s = JSON.parse(canonicalStatement(facts));
    expect(s.v).toBe("rout.mandate.declaration.v1");
    expect([s.workspace, s.holder, s.entity, s.domain, s.workEmail]).toEqual([WS, USER, OTHER, "example.be", OTHER]);
  });
  it("produces a 64-byte Ed25519 signature that fails for another statement", () => {
    const seed = new Uint8Array(32).fill(3);
    const digest = sha256(new TextEncoder().encode(canonicalStatement(facts)));
    const sig = ed25519.sign(statementSigningMessage(digest), seed);
    expect(sig).toHaveLength(64);
    const pk = ed25519.getPublicKey(seed);
    expect(ed25519.verify(sig, statementSigningMessage(digest), pk)).toBe(true);
    const other = sha256(new TextEncoder().encode(canonicalStatement({ ...facts, domain: "evil.be" })));
    expect(ed25519.verify(sig, statementSigningMessage(other), pk)).toBe(false);
    expect(ed25519.verify(sig, digest, pk)).toBe(false); // the bare digest is never accepted (domain separation)
  });
});
