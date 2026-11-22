/**
 * Layer 2 register checks. VIES (EU VAT, covers the Belgian KBO enterprise number) and GLEIF
 * (LEI). Only the outcome, the country, a digest of the register answer and, on opt-in, the
 * register name leave this module; the register number itself is reduced to a keyed nullifier.
 */
import { evidenceDigest, normalizeLei, normalizeVat, organisationNullifier } from "./proofs";
import type { RegisterKind } from "./proofs";

export type RegisterResult =
  | { ok: true; kind: RegisterKind; country: string; name: string | null; nullifier: Uint8Array; evidence: Uint8Array }
  | { ok: false; reason: "invalid_number" | "not_found" | "inactive" | "register_unavailable" };

type Fetch = typeof fetch;
const TIMEOUT_MS = 10000;

export async function checkVat(raw: string, pepper: string, fetchImpl: Fetch = fetch): Promise<RegisterResult> {
  const vat = normalizeVat(raw);
  if (!vat) return { ok: false, reason: "invalid_number" };
  let body: { isValid?: boolean; valid?: boolean; name?: string; requestDate?: string; userError?: string };
  try {
    const res = await fetchImpl(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${vat.country}/vat/${vat.number}`, {
      headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: "register_unavailable" };
    body = await res.json();
  } catch {
    return { ok: false, reason: "register_unavailable" };
  }
  if (body.userError && body.userError !== "VALID" && body.userError !== "INVALID") return { ok: false, reason: "register_unavailable" };
  if (!(body.isValid ?? body.valid)) return { ok: false, reason: "not_found" };
  const name = cleanName(body.name);
  const id = `${vat.country}${vat.number}`;
  return {
    ok: true, kind: "vat_vies", country: vat.country, name,
    nullifier: organisationNullifier("vat_vies", id, pepper),
    evidence: evidenceDigest("rout.org.vies.v1", [id, "valid", name ?? "", body.requestDate ?? ""]),
  };
}

export async function checkLei(raw: string, pepper: string, fetchImpl: Fetch = fetch): Promise<RegisterResult> {
  const lei = normalizeLei(raw);
  if (!lei) return { ok: false, reason: "invalid_number" };
  let body: { data?: { attributes?: { entity?: { legalName?: { name?: string }; legalAddress?: { country?: string }; status?: string }; registration?: { status?: string; nextRenewalDate?: string } } } };
  try {
    const res = await fetchImpl(`https://api.gleif.org/api/v1/lei-records/${lei}`, {
      headers: { accept: "application/vnd.api+json" }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "register_unavailable" };
    body = await res.json();
  } catch {
    return { ok: false, reason: "register_unavailable" };
  }
  const a = body.data?.attributes;
  const country = a?.entity?.legalAddress?.country?.toUpperCase() ?? "";
  if (!a || !/^[A-Z]{2}$/.test(country)) return { ok: false, reason: "not_found" };
  if (a.entity?.status !== "ACTIVE" || !["ISSUED", "PENDING_TRANSFER", "PENDING_ARCHIVAL"].includes(a.registration?.status ?? "")) {
    return { ok: false, reason: "inactive" };
  }
  const name = cleanName(a.entity?.legalName?.name);
  return {
    ok: true, kind: "lei_gleif", country, name,
    nullifier: organisationNullifier("lei_gleif", lei, pepper),
    evidence: evidenceDigest("rout.org.gleif.v1", [lei, a.registration?.status ?? "", name ?? "", a.registration?.nextRenewalDate ?? ""]),
  };
}

function cleanName(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const s = n.replace(/\s+/g, " ").trim();
  return s && s !== "---" ? s.slice(0, 200) : null;
}
