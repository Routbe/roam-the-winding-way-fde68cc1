import type { NegotiatedLocale } from "@/lib/locale-negotiation";

/**
 * Explainer and landing pages carry their language in the URL (/nl/…, /fr/…, /de/…, /en/…).
 * That language wins over the cookie and Accept-Language, so crawlers that send neither
 * (Bingbot, Googlebot) get <html lang>, Content-Language and the text in the page's own
 * language. Profiles and workspaces never have a prefix and keep negotiating.
 */
const PREFIX = /^\/(nl|fr|de|en)(?:\/|$)/i;

export function pathLocale(pathname: string): NegotiatedLocale | null {
  const match = PREFIX.exec(pathname);
  return match?.[1] ? (match[1].toLowerCase() as NegotiatedLocale) : null;
}
