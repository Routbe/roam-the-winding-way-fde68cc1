/**
 * Fetches pages the way Bingbot does (plain GET, no JavaScript) and reports every page whose initial
 * HTML breaks the metadata contract in src/lib/seo/metadata-guard.ts.
 *
 *   bun scripts/seo-raw-html-check.ts [base=https://rout.be] [--sitemap] [/path ...]
 *
 * Without paths it checks the key pages; --sitemap adds every URL of /sitemap-static.xml.
 */
import { rawHtmlIssues } from "../src/lib/seo/metadata-guard";

const KEY_PATHS = ["/", "/nl/pers", "/fr/presse", "/de/presse", "/en/press", "/tour", "/support/account/security", "/privacy", "/terms", "/discover"];
const UA = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

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
  const res = await fetch(`${base}${path}`, { headers: { "user-agent": UA }, redirect: "manual" });
  if (res.status !== 200) { console.log(`${res.status} ${path}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""}`); continue; }
  const html = await res.text();
  const issues = rawHtmlIssues(html);
  const header = res.headers.get("content-language");
  if (!header) issues.push({ field: "content-language", message: "no Content-Language header" });
  if (issues.length) failing++;
  console.log(`${issues.length ? "FAIL" : "ok  "} ${path}${issues.map((i) => `\n     - ${i.field}: ${i.message}`).join("")}`);
}
console.log(`\n${paths.length} pages, ${failing} with problems`);
process.exitCode = failing ? 1 : 0;
