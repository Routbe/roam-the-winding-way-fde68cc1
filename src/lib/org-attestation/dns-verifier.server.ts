/**
 * Layer 1 proof lookups. DNS goes over DoH (JSON API) and must come back DNSSEC-validated (AD
 * flag), as db/0300 requires for dns_txt. The well-known file is fetched over HTTPS without
 * following redirects (a redirect could hand the proof to another host).
 *
 * Result "error" means the lookup itself failed: callers never treat that as "absent", so a
 * resolver outage cannot lapse a seal.
 */
import { expectedProof, txtRecordName, unquoteTxt } from "./proofs";

export type ProofResult = { status: "present" } | { status: "absent"; reason: string } | { status: "error"; reason: string };

const DOH_ENDPOINTS = ["https://cloudflare-dns.com/dns-query", "https://dns.quad9.net:5053/dns-query"];
const TIMEOUT_MS = 6000;

type Fetch = typeof fetch;

interface DohAnswer { type: number; data: string }
interface DohResponse { Status: number; AD?: boolean; Answer?: DohAnswer[] }

export async function checkDnsTxt(domain: string, workspaceId: string, nonce: string, fetchImpl: Fetch = fetch): Promise<ProofResult> {
  const want = expectedProof(workspaceId, nonce);
  let lastError = "doh_unreachable";
  for (const base of DOH_ENDPOINTS) {
    try {
      const url = `${base}?name=${encodeURIComponent(txtRecordName(domain))}&type=TXT&do=1`;
      const res = await fetchImpl(url, { headers: { accept: "application/dns-json" }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { lastError = `doh_http_${res.status}`; continue; }
      return interpretDoh((await res.json()) as DohResponse, want);
    } catch (e) {
      lastError = e instanceof Error ? e.name : "doh_failed";
    }
  }
  return { status: "error", reason: lastError };
}

/** Exported for tests. NXDOMAIN (3) is a definite absence; SERVFAIL etc. are lookup errors. */
export function interpretDoh(body: DohResponse, want: string): ProofResult {
  if (body.Status === 3) return { status: "absent", reason: "nxdomain" };
  if (body.Status !== 0) return { status: "error", reason: `dns_status_${body.Status}` };
  const values = (body.Answer ?? []).filter((a) => a.type === 16).map((a) => unquoteTxt(a.data).trim().toLowerCase());
  if (!values.includes(want)) return { status: "absent", reason: values.length ? "value_mismatch" : "no_record" };
  if (body.AD !== true) return { status: "absent", reason: "dnssec_required" };
  return { status: "present" };
}

export async function checkWellKnown(domain: string, workspaceId: string, nonce: string, fetchImpl: Fetch = fetch): Promise<ProofResult> {
  try {
    const res = await fetchImpl(`https://${domain}/.well-known/rout.json`, { redirect: "manual", headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400) return { status: "absent", reason: "redirect_refused" };
    if (res.status === 404 || res.status === 410) return { status: "absent", reason: "not_found" };
    if (!res.ok) return { status: "error", reason: `http_${res.status}` };
    const text = await res.text();
    if (text.length > 4096) return { status: "absent", reason: "too_large" };
    return interpretWellKnown(text, expectedProof(workspaceId, nonce));
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.name : "fetch_failed" };
  }
}

/** Accepts {"rout": "<ws>:<nonce>"} or {"workspace_id": "...", "nonce": "..."}. */
export function interpretWellKnown(text: string, want: string): ProofResult {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { status: "absent", reason: "invalid_json" }; }
  if (!json || typeof json !== "object") return { status: "absent", reason: "invalid_json" };
  const o = json as Record<string, unknown>;
  const got = typeof o["rout"] === "string" ? o["rout"] : typeof o["workspace_id"] === "string" && typeof o["nonce"] === "string" ? `${o["workspace_id"]}:${o["nonce"]}` : "";
  return got.trim().toLowerCase() === want ? { status: "present" } : { status: "absent", reason: "value_mismatch" };
}
