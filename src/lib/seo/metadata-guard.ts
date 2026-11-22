/**
 * One metadata contract for every ROUT page (owner rules, 2026-11-22):
 * - <title> 20–60 characters, ending in " | ROUT"; the most important words stay in front.
 * - meta description 120–155 characters in the source; never cut in the middle of a sentence.
 * - every page delivers exactly one title, description, h1, lang and canonical in the raw HTML.
 * Pure: shared by the head renderer, the build-time linter and the raw-HTML crawler.
 */

export const SITE_SUFFIX = " | ROUT";
export const TITLE_LIMITS = { min: 20, max: 60 } as const;
export const DESCRIPTION_LIMITS = { min: 120, max: 155 } as const;
/** Bounds the raw-HTML linter accepts (Bing/Google truncate outside these). */
export const DESCRIPTION_LINT_LIMITS = { min: 70, max: 160 } as const;

const SEPARATORS = [" — ", " – ", " | ", ": ", " · ", " - ", ", "];

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/** Longest prefix of `text` that fits in `max`: first at a separator, otherwise at a word boundary. */
export function shortenNaturally(text: string, max: number): string {
  const clean = squash(text);
  if (clean.length <= max) return clean;
  let best = "";
  for (const sep of SEPARATORS) {
    let at = clean.indexOf(sep);
    while (at > 0) {
      if (at <= max && at > best.length) best = clean.slice(0, at);
      at = clean.indexOf(sep, at + 1);
    }
  }
  if (best.length >= Math.min(12, max)) return best.replace(/[\s,;:·–—|-]+$/u, "");
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : clean.slice(0, max)).replace(/[\s,;:·–—|-]+$/u, "");
}

/** `Page name | ROUT`, shortened naturally to at most 60 characters. */
export function fitTitle(name: string, suffix: string = SITE_SUFFIX): string {
  const clean = squash(name);
  if (!clean) return "";
  return `${shortenNaturally(clean, TITLE_LIMITS.max - suffix.length)}${suffix}`;
}

/** A title that already carries its own brand (member pages): only the length is enforced. */
export function fitPlainTitle(title: string): string {
  return shortenNaturally(title, TITLE_LIMITS.max);
}

/**
 * Keeps a description at most 155 characters by dropping whole trailing sentences.
 * Only when the first sentence alone is too long is it shortened at a clause or word, ending in "…".
 */
export function fitDescription(text: string): string {
  const clean = squash(text);
  if (clean.length <= DESCRIPTION_LIMITS.max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?:["»”)]*)?(?:\s+|$)/gu) ?? [];
  let out = "";
  for (const sentence of sentences) {
    const next = `${out}${sentence}`.trimEnd();
    if (next.length > DESCRIPTION_LIMITS.max) break;
    out = `${next} `;
  }
  out = out.trim();
  if (out.length >= DESCRIPTION_LINT_LIMITS.min) return out;
  return `${shortenNaturally(clean, DESCRIPTION_LIMITS.max - 1)}…`;
}

export type MetadataIssue = { field: "title" | "description" | "h1" | "lang" | "content-language" | "canonical" | "json-ld"; message: string };

/** Problems with a title/description pair against the source rules (used by the build-time linter). */
export function sourceMetadataIssues(title: string, description: string): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const t = squash(title);
  const d = squash(description);
  if (t.length < TITLE_LIMITS.min || t.length > TITLE_LIMITS.max) issues.push({ field: "title", message: `title is ${t.length} characters (${TITLE_LIMITS.min}–${TITLE_LIMITS.max}): "${t}"` });
  if (d.length < DESCRIPTION_LIMITS.min || d.length > DESCRIPTION_LIMITS.max) issues.push({ field: "description", message: `description is ${d.length} characters (${DESCRIPTION_LIMITS.min}–${DESCRIPTION_LIMITS.max}): "${d}"` });
  return issues;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
export const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });

const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

/** What a crawler that runs no JavaScript sees wrong in a page's initial HTML. */
export function rawHtmlIssues(html: string, options: { indexable?: boolean } = {}): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  const titles = [...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => squash(decodeEntities(m[1] ?? "")));
  if (titles.length !== 1) issues.push({ field: "title", message: `${titles.length} <title> tags` });
  const title = titles[0] ?? "";
  if (titles.length === 1 && (title.length < TITLE_LIMITS.min || title.length > TITLE_LIMITS.max)) issues.push({ field: "title", message: `title is ${title.length} characters: "${title}"` });
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const descriptions = metas.filter((m) => attr(m, "name")?.toLowerCase() === "description").map((m) => squash(decodeEntities(attr(m, "content") ?? "")));
  if (descriptions.length !== 1) issues.push({ field: "description", message: `${descriptions.length} description tags` });
  const description = descriptions[0] ?? "";
  if (descriptions.length === 1 && (description.length < DESCRIPTION_LINT_LIMITS.min || description.length > DESCRIPTION_LINT_LIMITS.max)) issues.push({ field: "description", message: `description is ${description.length} characters` });
  const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const lang = attr(htmlTag, "lang") ?? "";
  if (!lang) issues.push({ field: "lang", message: "<html> has no lang" });
  const contentLanguage = metas.filter((m) => attr(m, "http-equiv")?.toLowerCase() === "content-language").map((m) => attr(m, "content") ?? "");
  if (contentLanguage.length !== 1) issues.push({ field: "content-language", message: `${contentLanguage.length} content-language tags` });
  else if (lang && contentLanguage[0] !== lang) issues.push({ field: "content-language", message: `content-language ${contentLanguage[0]} differs from lang ${lang}` });
  const body = html.slice(html.search(/<body[\s>]/i));
  const h1 = (body.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) issues.push({ field: "h1", message: `${h1} <h1> elements` });
  if (options.indexable !== false) {
    const canonicals = [...head.matchAll(/<link\b[^>]*>/gi)].filter((m) => attr(m[0], "rel")?.toLowerCase() === "canonical");
    if (canonicals.length !== 1) issues.push({ field: "canonical", message: `${canonicals.length} canonical links` });
  }
  const graphs = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!graphs.length) issues.push({ field: "json-ld", message: "no JSON-LD" });
  for (const g of graphs) {
    try { JSON.parse(g[1] ?? ""); } catch { issues.push({ field: "json-ld", message: "JSON-LD does not parse" }); }
  }
  return issues;
}
