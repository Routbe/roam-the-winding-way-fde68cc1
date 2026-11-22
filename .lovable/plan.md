# SEO/GEO-plan ROUT: audit en fasering S1–S7

Alleen plan: er wordt geen code geschreven en er draaien geen migraties vóór je GO. Elke fase wordt apart opgeleverd, met tests, een preview-controle en een terugrolpad, zonder extra Neon-reads voor bots.

## Bevindingen van vandaag (rout.be bevraagd als Bingbot, zonder JavaScript)

| Pagina | Wat Bing ziet | Probleem |
|---|---|---|
| `/` | titel, description, 1 h1, JSON-LD | titel is 76 tekens, description 119, `lang="en"` |
| `/nl/pers`, `/fr/presse`, `/de/presse`, `/en/press` | titel, h1, JSON-LD | **`lang="en"` op alle vier**, description 89–113 tekens, geen content-language |
| `/support/account/security` | titel 73 tekens | "Title too long" bevestigd; description 61 |
| `/privacy`, `/terms`, `/developers`, `/discover` | aanwezig | titels 67–87 tekens, descriptions te kort of te lang |
| `/pricing`, onbekende pagina's | standaardtitel van de site | geen eigen titel; soft-404 (`/u/anything` geeft 200 zonder h1) |
| `/nl/alternatief-voor-linktree` | "Link van @nl" | **`/nl/...` wordt gelezen als een link van het profiel "nl"**, zonder h1 |
| `/jdelplanche` | 301 naar `/@jdelplanche`, lege body | doorverwijzing zonder head: dit is waarschijnlijk de URL waarop Bing "geen titel, geen h1, geen markup" meldt |
| alle pagina's | geen `X-Robots-Tag`, geen `Content-Language` | alleen HSTS zonder preload |

Vaststelling: de head wordt al op de server gerenderd. Op `/` en op de perspagina's kon ik de Bing-fouten "ontbrekend" dus niet reproduceren. De echte oorzaken zijn de verkeerde `lang`, de te lange titels, de doorverwijzing met lege body en de `/nl/`-paden die als profiel gelezen worden. Daarnaast wijst de Vercel-header `cdg1::iad1` erop dat de server in de VS draait (iad1) en niet in fra1: dat moet nagekeken worden.

Al klaar: IndexNow (sleutelbestand + pings), perspagina met wederzijdse hreflang en ContactPoint, sitemaps per soort, llms.txt, gereserveerde taalnamen in de code (in de database pas met 0302).

## Stand per pilaar (C = in orde, I = onvolledig, M = ontbreekt)

1. Taal-URL's: profielcanonicals C; route-taal bepaalt `lang` niet I; 16 landingspagina's M; `/nl/*` botst met handles I.
2. Normalisatie: X-Robots-Tag M; 307 in plaats van 308 I; canonicals strippen `utm_*` niet I; echte 404/410 I.
3. White-label/sitemaps: per-host robots/sitemap M; sitemap-index M; ETag/304 M; agenda-sitemap koppelt `/u/` aan root-namen I (privacy, eerst).
4. Entiteitengraaf: bestaat, ID's niet stabiel (`#org`) I; BreadcrumbList M; rel=me zonder verificatiecontrole I.
5. GEO: llms-bestanden zonder ETag en met dunne inhoud I; robots.txt sluit `/u/`, `/admin/`, `/auth/` niet uit I.
6. IndexNow: C; open punten: sleutel volgt `INDEXNOW_KEY` dynamisch, rollend venster van 36 uur, logs zonder volledige URL's.
7. OG-kaarten: C; vertrouwensniveau ontbreekt, cache pas na database-read, `select *` I.
8. oEmbed, WebFinger, security.txt, rout-trust.json, changelog-feed: M (security.txt en WebFinger geven nu HTML).
9. Prestaties/a11y: fonts lokaal C; speculationrules en skip-link M; securityheaders alleen op `/secure/*` I.
10. Regressietests: deels I; de gevraagde suites M.

## Fasering

**S1: Ruwe HTML en metadatabewaker (de Bing-meldingen, eerst)**
- De taal van de route bepaalt `<html lang>`, `content-language` (meta en HTTP-header) en de tekst op `/nl|fr|de|en/*`; profielen blijven onderhandelen zoals nu.
- Centrale bewaker: titel 20–60 tekens met " | ROUT" achteraan (de lange merknaam blijft in og:site_name en de graaf), description 120–155 tekens op een zinsgrens, per taal, met één h1. Lege of dubbele tags breken de build.
- Alle titels en descriptions herschreven in 4 talen (o.a. "Accountbeveiliging & sleutels | ROUT"). `/pricing` en andere pagina's krijgen een eigen head.
- JSON-LD `@graph` server-side op elke publieke pagina; doorverwijzingen krijgen een korte HTML-body met titel en canonical.
- Tests: linter over alle routes en talen; kale HTTP GET op de belangrijkste pagina's controleert title, description, lang, h1 en JSON-LD.

**S2: Antwoordrand**: `X-Robots-Tag: noindex, nofollow` op `/u`, `/admin`, `/api`, `/auth` en 404's; 308-normalisatie; echte 404 (geen soft-404); `/nl|fr|de|en/*` nooit meer naar een profiel; algemene securityheaders. HSTS-preload pas na domeincontrole.

**S3: URL- en privacycontracten**: canonicals zonder tracking-parameters, 410 alleen bij echte verwijdering, agenda-sitemap zonder koppeling tussen naamruimtes, rel=me alleen geverifieerd, robots.txt met de AI-crawlers.

**S4: Cache-first ontdekking**: één ETag/304-helper voor sitemaps, robots, llms en OG; sitemap-index; OG-cache vóór de database; minimale kolommen. Test: cachetreffer en 304 doen nul queries.

**S5: Meertalige landingspagina's**: 16 URL's uit één register (topics.ts uitgebreid), wederzijdse hreflang in HTML en Link-header, vergelijkingstabellen met alleen geverifieerde feiten, BreadcrumbList. `/discover/<topic>` blijft de overzichtspagina en linkt naar de taalversies.

**S6: White-label en publieke diensten**: per-host robots/sitemap/canonical met een allowlist; oEmbed, WebFinger (alleen root-handles), security.txt (RFC 9116), rout-trust.json, changelog-feed, rijkere llms-full.txt.

**S7: Kwaliteitspoorten**: IndexNow-verbeteringen (dynamische sleutel, 36-uursvenster, log-hygiëne), speculationrules, skip-link, mediamaten, gemeten CWV- en toetsenbordtests, Vercel-regio fra1 bevestigen, alle SEO-suites verplicht in de build.

## Correcties op het aangeleverde plan
- IndexNow vraagt om opname maar garandeert ze niet.
- CLOUD Act en Codeberg blijven weg tot ze bevestigd zijn; ML-DSA-65 bestaat, maar niet alles is post-quantum.
- "Nul derde partijen" geldt niet voor betalingen en embeds: die worden afgeschermd of uitdrukkelijk als uitzondering vermeld.

## Technische details
- Route-taal: `beforeLoad` van `/$lang`-routes zet de locale in de routercontext vóór `__root` rendert; `src/server.ts` zet de `Content-Language`- en `X-Robots-Tag`-headers.
- Bewaker: `src/lib/seo/metadata-guard.ts` (puur) vervangt `brandTitle` in `src/lib/page-title.ts`; `src/test/seo-route-lint.test.ts` loopt over de route-manifest × 4 talen; `src/test/seo-raw-html.test.ts` vraagt de server-handler op zonder JS.
- Geen databasewijziging in S1–S4; mogelijke migraties in S6 krijgen elk een eigen GO.
- Vastgelegd in AGENTS.md na GO: route-taal boven onderhandeling voor `/<lang>/*`.
