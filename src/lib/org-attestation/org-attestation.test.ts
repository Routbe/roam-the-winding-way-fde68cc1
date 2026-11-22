import { describe, expect, it } from "vitest";
import { belgianCheck, emailOnDomain, expectedProof, normalizeDomain, normalizeLei, normalizeVat, organisationNullifier, unquoteTxt } from "./proofs";
import { interpretDoh, interpretWellKnown } from "./dns-verifier.server";
import { EvidenceVaultError, openEvidence, pdfHasActiveContent, sealEvidence, sniffMime } from "./evidence-vault.server";
import { checkVat, checkLei } from "./vies-gleif.server";

const WS = "11111111-2222-4333-8444-555555555555";
const NONCE = "0123456789abcdef0123456789abcdef";
const PEPPER = "p".repeat(40);
const KEK = { ROUT_EVIDENCE_KEK: "A".repeat(64) };
const pdf = () => new TextEncoder().encode("%PDF-1.7 test document\n%%EOF");
const REVIEW = "aaaaaaaa-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

describe("layer 1 proofs", () => {
  it("expects the TXT value <workspace_id>:<nonce> at _rout.<domain>", () => {
    expect(expectedProof(WS, NONCE)).toBe(`${WS}:${NONCE}`);
    expect(normalizeDomain(" Example.BE. ")).toBe("example.be");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(unquoteTxt('"abc" "def"')).toBe("abcdef");
  });
  it("accepts a DNS answer only when DNSSEC-validated (AD flag)", () => {
    const answer = { Status: 0, Answer: [{ type: 16, data: `"${WS}:${NONCE}"` }] };
    expect(interpretDoh({ ...answer, AD: true }, expectedProof(WS, NONCE)).status).toBe("present");
    expect(interpretDoh({ ...answer, AD: false }, expectedProof(WS, NONCE))).toEqual({ status: "absent", reason: "dnssec_required" });
  });
  it("never reports a resolver failure as an absent record", () => {
    expect(interpretDoh({ Status: 2 }, "x").status).toBe("error");
    expect(interpretDoh({ Status: 3 }, "x").status).toBe("absent");
  });
  it("reads the well-known proof", () => {
    expect(interpretWellKnown(JSON.stringify({ rout: `${WS}:${NONCE}` }), expectedProof(WS, NONCE)).status).toBe("present");
    expect(interpretWellKnown(JSON.stringify({ rout: `${WS}:ffff` }), expectedProof(WS, NONCE)).status).toBe("absent");
  });
  it("accepts a work e-mail only on exactly the workspace domain", () => {
    expect(emailOnDomain("Jan@Example.be", "example.be")).toBe("jan@example.be");
    expect(emailOnDomain("jan@mail.example.be", "example.be")).toBeNull();
  });
});

describe("layer 2 registers", () => {
  it("validates Belgian enterprise numbers with the mod-97 check", () => {
    expect(belgianCheck("0403170701")).toBe(true);
    expect(normalizeVat("BE 0403.170.701")).toEqual({ country: "BE", number: "0403170701" });
    expect(normalizeVat("BE0403170702")).toBeNull();
  });
  it("validates LEI checksums", () => {
    expect(normalizeLei("5493001KJTIIGC8Y1R12")).toBe("5493001KJTIIGC8Y1R12");
    expect(normalizeLei("5493001KJTIIGC8Y1R13")).toBeNull();
  });
  it("derives a 32-byte keyed nullifier that differs per pepper and never contains the number", () => {
    const a = organisationNullifier("vat_vies", "BE0403170701", PEPPER);
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).toString("hex")).not.toEqual(Buffer.from(organisationNullifier("vat_vies", "BE0403170701", "q".repeat(40))).toString("hex"));
    expect(() => organisationNullifier("vat_vies", "BE0403170701", "short")).toThrow();
  });
  it("returns the VIES outcome without the register number", async () => {
    const fake = (async () => new Response(JSON.stringify({ isValid: true, name: "NV TEST", requestDate: "2026-11-22" }))) as typeof fetch;
    const r = await checkVat("BE0403170701", PEPPER, fake);
    expect(r.ok && r.country).toBe("BE");
    expect(JSON.stringify(r)).not.toContain("0403170701");
  });
  it("treats an unreachable register as unavailable, not as not-found", async () => {
    const down = (async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await checkLei("5493001KJTIIGC8Y1R12", PEPPER, down)).toEqual({ ok: false, reason: "register_unavailable" });
  });
});

describe("evidence vault", () => {
  it("round-trips under the same workspace and review id", () => {
    const { sealed, sha256 } = sealEvidence(WS, REVIEW, pdf(), KEK);
    expect(new TextDecoder().decode(openEvidence(WS, REVIEW, sealed, sha256, KEK))).toBe("%PDF-1.7 test document\n%%EOF");
  });
  it("refuses a ciphertext moved to another review (AAD mismatch)", () => {
    const { sealed, sha256 } = sealEvidence(WS, REVIEW, pdf(), KEK);
    expect(() => openEvidence(WS, OTHER, sealed, sha256, KEK)).toThrow(EvidenceVaultError);
  });
  it("refuses a ciphertext moved to another workspace (AAD mismatch)", () => {
    const { sealed, sha256 } = sealEvidence(WS, REVIEW, pdf(), KEK);
    expect(() => openEvidence(OTHER, REVIEW, sealed, sha256, KEK)).toThrow(EvidenceVaultError);
  });
  it("refuses a tampered ciphertext or a wrong digest", () => {
    const { sealed, sha256 } = sealEvidence(WS, REVIEW, pdf(), KEK);
    const bad = sealed.slice(); bad[bad.length - 1]! ^= 1;
    expect(() => openEvidence(WS, REVIEW, bad, sha256, KEK)).toThrow(EvidenceVaultError);
    expect(() => openEvidence(WS, REVIEW, sealed, new Uint8Array(32), KEK)).toThrow(EvidenceVaultError);
  });
  it("gives every file its own data key (REV2)", () => {
    const a = sealEvidence(WS, REVIEW, pdf(), KEK).sealed;
    expect(new TextDecoder().decode(a.subarray(0, 4))).toBe("REV2");
  });
  it("opens a file after rotation only while the previous KEK is kept", () => {
    const { sealed, sha256 } = sealEvidence(WS, REVIEW, pdf(), KEK);
    const next = "N".repeat(48);
    const old = KEK["ROUT_EVIDENCE_KEK"];
    expect(openEvidence(WS, REVIEW, sealed, sha256, { ROUT_EVIDENCE_KEK: next, ROUT_EVIDENCE_KEK_PREVIOUS: old }).length).toBeGreaterThan(0);
    expect(() => openEvidence(WS, REVIEW, sealed, sha256, { ROUT_EVIDENCE_KEK: next })).toThrow(EvidenceVaultError);
  });
  it("uses a fresh 96-bit nonce per file", () => {
    const a = sealEvidence(WS, REVIEW, pdf(), KEK).sealed.subarray(4, 16);
    const b = sealEvidence(WS, REVIEW, pdf(), KEK).sealed.subarray(4, 16);
    expect(a).toHaveLength(12);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
  it("refuses to seal without a valid ROUT_EVIDENCE_KEK", () => {
    expect(() => sealEvidence(WS, REVIEW, pdf(), {})).toThrow(EvidenceVaultError);
    expect(() => sealEvidence(WS, REVIEW, pdf(), { ROUT_EVIDENCE_KEK: "short" })).toThrow(EvidenceVaultError);
  });
  it("rejects files over 5 MB", () => {
    expect(() => sealEvidence(WS, REVIEW, new Uint8Array(5 * 1024 * 1024 + 1), KEK)).toThrow(EvidenceVaultError);
  });
  it("recognises the file type from its contents only", () => {
    expect(sniffMime(pdf())).toBe("application/pdf");
    expect(sniffMime(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffMime(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("hello"))).toBeNull();
  });
  it("rejects invalid magic bytes, renamed executables and truncated PNG signatures", () => {
    expect(sniffMime(new TextEncoder().encode("MZ\x90\x00 this is a renamed .exe"))).toBeNull();
    expect(sniffMime(Uint8Array.of(0x7f, 0x45, 0x4c, 0x46, 1, 1))).toBeNull();
    expect(sniffMime(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0))).toBeNull();
  });
  it("rejects HTML/SVG polyglots and PDFs without a trailer", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 <html><script>alert(1)</script>\n%%EOF"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 <svg onload=x>\n%%EOF"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7 no trailer"))).toBeNull();
  });
  it("rejects PDFs with scripts, launch actions, embedded files or XFA, also behind name escapes", () => {
    const doc = (body: string) => new TextEncoder().encode(`%PDF-1.7\n1 0 obj << ${body} >> endobj\n%%EOF`);
    expect(sniffMime(doc("/Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >>"))).toBeNull();
    expect(sniffMime(doc("/OpenAction << /S /J#61vaScript >>"))).toBeNull();
    expect(sniffMime(doc("/A << /S /Launch /F (cmd.exe) >>"))).toBeNull();
    expect(sniffMime(doc("/Names << /EmbeddedFiles 2 0 R >>"))).toBeNull();
    expect(sniffMime(doc("/AcroForm << /XFA 3 0 R >>"))).toBeNull();
    expect(pdfHasActiveContent(doc("/A << /S /SubmitForm >>"))).toBe(true);
  });
  it("still accepts an ordinary PDF that opens on a page or uses look-alike font names", () => {
    const doc = (body: string) => new TextEncoder().encode(`%PDF-1.7\n1 0 obj << ${body} >> endobj\n%%EOF`);
    expect(sniffMime(doc("/Type /Catalog /OpenAction [3 0 R /Fit] /Pages 2 0 R"))).toBe("application/pdf");
    expect(sniffMime(doc("/BaseFont /JSans-Bold /FontName /JavaScriptFont"))).toBe("application/pdf");
  });
});
