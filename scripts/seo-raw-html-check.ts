/**
 * Fetches pages the way Bingbot does (plain GET, no JavaScript) and reports every page whose initial
 * HTML breaks the metadata contract in src/lib/seo/metadata-guard.ts.
 *
 *   bun scripts/seo-raw-html-check.ts [base=https://rout.be] [--sitemap] [--lang=nl] [--json=out.json] [/path ...]
 *
 * Without paths it checks the key pages; --sitemap adds every URL of /sitemap-static.xml.
 */
import { writeFileSync } from "node:fs";
import { decodeEntities, rawHtmlIssues } from "../src/lib/seo/metadata-guard";

const KEY_PATHS = ["/", "/nl/pers", "/fr/presse", "/de/presse", "/en/press", "/tour", "/support/account/security", "/privacy", "/terms", "/discover"];
const UA = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const lang = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
const jsonOut = process.argv.find((a) => a.startsWith("--json="))?.slice(7);
const headers: Record<string, string> = { "user-agent": UA, ...(lang ? { "accept-language": lang } : {}) };
const report: { path: string; status: number; title: string; description: string; issues: string[] }[] = [];

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "https://rout.be").replace(/\/$/, "");
let paths = args.filter((a) => a.startsWith("/"));
if (!paths.length) paths = KEY_PATHS;
if (args.includes("--sitemap")) {
  const xml = await (await fetch(`${base}/sitemap-static.xml`, { headers: { "user-agent": UA } })).text();
  paths = [...new Set([...paths, ...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "/").pathname)])];
}

let failing = 0;
for (const path of paths) {
  const res = await fetch(`${base}${path}`, { headers, redirect: "manual" });
  if (res.status !== 200) { console.log(`${res.status} ${path}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""}`); continue; }
  const html = await res.text();
  const issues = rawHtmlIssues(html);
  const header = res.headers.get("content-language");
  if (!header) issues.push({ field: "content-language", message: "no Content-Language header" });
  if (issues.length) failing++;
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  report.push({
    path, status: res.status,
    title: decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? ""),
    description: decodeEntities(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(head)?.[1] ?? ""),
    issues: issues.map((i) => `${i.field}: ${i.message}`),
  });
  console.log(`${issues.length ? "FAIL" : "ok  "} ${path}${issues.map((i) => `\n     - ${i.field}: ${i.message}`).join("")}`);
}
console.log(`\n${paths.length} pages, ${failing} with problems`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
process.exitCode = failing ? 1 : 0;
