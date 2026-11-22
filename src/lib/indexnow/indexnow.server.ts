/**
 * Non-blocking IndexNow pings. Callers fire and forget: every function here returns
 * synchronously, never throws, and hands its network work to the request's waitUntil.
 */
import { registerBackgroundTask } from "@/lib/background-task.server";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_TIMEOUT_MS,
  filterIndexNowUrls,
  indexNowKeyForEnv,
  indexNowPayload,
} from "./indexnow";

/** Same URL is not re-sent within this window per server instance (repeated publishes). */
const DEDUPE_MS = 10 * 60 * 1000;
const recent = new Map<string, number>();

function fresh(urls: string[], now: number): string[] {
  for (const [url, at] of recent) if (now - at > DEDUPE_MS) recent.delete(url);
  return urls.filter((url) => !recent.has(url));
}

export type IndexNowResult = { sent: number; status?: number; skipped?: "disabled" | "empty"; error?: true };

/** Sends one POST; resolves (never rejects) after at most INDEXNOW_TIMEOUT_MS. */
export async function submitIndexNow(paths: readonly string[], env = process.env): Promise<IndexNowResult> {
  const key = indexNowKeyForEnv(env);
  if (!key) return { sent: 0, skipped: "disabled" };
  const now = Date.now();
  const urls = fresh(filterIndexNowUrls(paths), now);
  if (!urls.length) return { sent: 0, skipped: "empty" };
  for (const url of urls) recent.set(url, now);
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(key, urls)),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`[indexnow] HTTP ${res.status} for ${urls.length} URL(s)`);
    return { sent: urls.length, status: res.status };
  } catch {
    for (const url of urls) recent.delete(url);
    console.warn(`[indexnow] request failed for ${urls.length} URL(s)`);
    return { sent: 0, error: true };
  }
}

/** Fire-and-forget wrapper: schedules `work` in the background and returns at once. */
function inBackground(work: () => Promise<readonly string[]>): void {
  if (!indexNowKeyForEnv(process.env)) return; // preview, localhost, no key: no DB read, no ping
  try {
    const task = work()
      .then((paths) => submitIndexNow(paths))
      .catch(() => undefined);
    registerBackgroundTask(task);
  } catch {
    /* never affect the caller */
  }
}

/** A verified root profile was published: ping its public URL if it is indexable. */
export function notifyRootProfilePublished(userId: string): void {
  inBackground(async () => {
    const { sql } = await import("@/lib/neon");
    const { PUBLIC_MEMBER_PREDICATE } = await import("@/lib/sitemap-index.server");
    const { styledProfilePath, urlStyleForAtPreference, urlStyleHasAt, isUrlStyle } = await import("@/lib/profile-url");
    const rows = (await sql.query(
      `select p.username, p.url_style from public.profiles p where p.user_id = $1::uuid and ${PUBLIC_MEMBER_PREDICATE} limit 1`,
      [userId],
    )) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) return [];
    const style = isUrlStyle(row["url_style"]) ? row["url_style"] : "clean_at";
    return [styledProfilePath(String(row["username"]), urlStyleForAtPreference(urlStyleHasAt(style)))];
  });
}

/** A workspace page was published: ping /w/<slug> when its Studio page is public. */
export function notifyWorkspacePublished(workspaceId: string): void {
  inBackground(async () => {
    const { sql } = await import("@/lib/neon");
    const { readPublishedStudio, workspaceStudioIsPublic } = await import("@/lib/workspace-studio");
    const rows = (await sql.query(
      `select slug, domain, domain_verified_at, public_profile from public.workspaces where id = $1::uuid limit 1`,
      [workspaceId],
    )) as Record<string, unknown>[];
    const row = rows[0];
    if (!row || typeof row["slug"] !== "string") return [];
    // A verified custom domain is another host; IndexNow pings for rout.be only.
    if (row["domain"] && row["domain_verified_at"]) return [];
    const studio = readPublishedStudio(row["public_profile"]);
    if (!studio || !workspaceStudioIsPublic(studio)) return [];
    return [`/w/${row["slug"]}`];
  });
}

/**
 * Landing and explainer pages are code: the daily job pings pages whose own
 * last_updated date is today or yesterday (UTC), i.e. created or changed since the last run.
 */
export async function pingRecentLandingPages(now = new Date()): Promise<IndexNowResult> {
  if (!indexNowKeyForEnv(process.env)) return { sent: 0, skipped: "disabled" };
  const { staticEntries } = await import("@/lib/sitemap-index.server");
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const paths = staticEntries()
    .filter((e) => e.lastmod === today || e.lastmod === yesterday)
    .map((e) => e.path);
  return submitIndexNow(paths);
}
