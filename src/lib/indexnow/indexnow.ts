/**
 * IndexNow for rout.be (https://www.indexnow.org/documentation).
 * The key is public by protocol: search engines fetch it from KEY_LOCATION to prove
 * that we own the host. Pure module: no env reads at import time, no network.
 */
export const INDEXNOW_HOST = "rout.be";
export const INDEXNOW_ORIGIN = `https://${INDEXNOW_HOST}`;
/** Same value as INDEXNOW_KEY in Vercel Production; the key file name must equal it. */
export const INDEXNOW_PUBLIC_KEY = "17df389a1c714eb6ba529d0ae7262a9f";
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_PUBLIC_KEY}.txt`;
export const INDEXNOW_KEY_LOCATION = `${INDEXNOW_ORIGIN}${INDEXNOW_KEY_PATH}`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
/** IndexNow must never slow down a request: one short attempt, no retries. */
export const INDEXNOW_TIMEOUT_MS = 3000;
export const INDEXNOW_MAX_URLS = 10_000;

/** First path segments that never go to a search engine (privacy, Zero Public Correlation). */
export const INDEXNOW_BLOCKED_PREFIXES = ["u", "admin", "api", "auth"] as const;

/** UTF-8 key file: the key and nothing else. */
export function indexNowKeyFileResponse(): Response {
  return new Response(INDEXNOW_PUBLIC_KEY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Returns the absolute https://rout.be URL for a path or URL, or null when it may not be
 * submitted: other hosts, non-https, credentials, or a blocked first segment (also when
 * percent-encoded, mixed-case or reached through dot segments).
 */
export function indexNowUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input, INDEXNOW_ORIGIN);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== INDEXNOW_HOST || url.port || url.username || url.password) return null;
  let segments: string[];
  try {
    segments = url.pathname.split("/").map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    return null;
  }
  // Leading "" from the root slash; an empty second segment means "//…".
  const first = segments[1] ?? "";
  if (segments.length > 2 && first === "") return null;
  if ((INDEXNOW_BLOCKED_PREFIXES as readonly string[]).includes(first)) return null;
  // Decoded slashes or dot segments could still reach a blocked area.
  if (segments.some((s) => s.includes("/") || s === "." || s === "..")) return null;
  url.hash = "";
  return url.toString();
}

/** Allowed, de-duplicated absolute URLs, capped at the protocol limit. */
export function filterIndexNowUrls(inputs: readonly string[]): string[] {
  const out = new Set<string>();
  for (const input of inputs) {
    const url = indexNowUrl(input);
    if (url) out.add(url);
    if (out.size >= INDEXNOW_MAX_URLS) break;
  }
  return [...out];
}

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] };

export function indexNowPayload(key: string, urlList: string[]): IndexNowPayload {
  return { host: INDEXNOW_HOST, key, keyLocation: INDEXNOW_KEY_LOCATION, urlList };
}

type Env = Record<string, string | undefined>;

/**
 * Production only: INDEXNOW_KEY is set and equals the served key, PUBLIC_ORIGIN is
 * https://rout.be, and Vercel does not report a preview/development deployment.
 * Returns the key when pings are allowed, otherwise null.
 */
export function indexNowKeyForEnv(env: Env): string | null {
  const key = env["INDEXNOW_KEY"]?.trim();
  if (!key || key !== INDEXNOW_PUBLIC_KEY) return null;
  const vercelEnv = env["VERCEL_ENV"]?.trim();
  if (vercelEnv && vercelEnv !== "production") return null;
  let origin: URL;
  try {
    origin = new URL(env["PUBLIC_ORIGIN"]?.trim() ?? "");
  } catch {
    return null;
  }
  if (origin.protocol !== "https:" || origin.hostname !== INDEXNOW_HOST) return null;
  return key;
}
