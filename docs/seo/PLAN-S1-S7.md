# SEO/GEO-plan ROUT — fases S1–S7 (alleen plan, nog geen code)

Bron: audit van de code en live controles van https://rout.be op 2026-11-22 (alleen lezen).
Legende: **C** = bestaat en klopt, **I** = bestaat maar onvolledig/fout, **M** = ontbreekt.
Elke fase: eerst tests, database en netwerk gemockt, preview-controle, expliciete GO en terugrolpad.
Nul risico bestaat niet; "nul extra Neon-reads" vraagt gecachte publicatiebestanden, niet alleen ETags na een query.

## Live vastgesteld (2026-11-22)

| Adres | Status | Opmerking |
|---|---:|---|
| `/` | 200 | `max-age=0, must-revalidate` |
| `/robots.txt` | 200 | enige antwoord met ETag |
| `/sitemap.xml`, `/llms.txt` | 200 | `max-age=3600`, geen ETag/304 |
| `/u/anything`, `/audit-nonexistent-7cf391` | 200 | **soft-404** |
| `/.well-known/security.txt`, `/.well-known/webfinger` | 200 | **HTML in plaats van het juiste formaat** |
| `/press/` | 307 | moet 308 zijn |

Op elk antwoord alleen `Strict-Transport-Security: max-age=63072000` (zonder preload). Geen `X-Robots-Tag`, `Link`, CSP, Referrer-Policy, nosniff of Permissions-Policy: de bestaande regels in `src/lib/security-headers.ts` worden alleen op `/secure/*` toegepast.

## Stand per pijler

1. **Meertalige URL's** — taalneutrale profielcanonicals C; workspace-canonical M; custom-domein-root wijst canonical naar rout.be I; de 16 vertaalde landingspagina's M; wederzijdse hreflang (HTML + HTTP) M; geen taalredirect op `/` C; taalcodes als handle gereserveerd in de code maar niet in de `system_reserved`-seed van de database I.
2. **URL-normalisatie en statuscodes** — `noindex, nofollow` als HTTP-header op `/u`, `/admin`, `/api`, `/auth` M; slash-normalisatie 307 i.p.v. 308 I; `canonicalLinks()` stript query/fragment niet ondanks het commentaar I; echte 404 I (component bestaat, live 200); 410-beleid voor definitief verwijderde profielen M.
3. **White-label en sitemaps** — host-bewuste weergave I; host-gescheiden robots/sitemaps M; sharding I (`/sitemap-index.xml` ontbreekt); ETag/304 M; **agenda-sitemap publiceert `/u/<geverifieerde-hoofdnaam>/agenda` en koppelt zo beide naamruimtes** I (eerst oplossen).
4. **Entiteitengraaf en rel=me** — graaf bestaat met ID's `#org/#app` i.p.v. `#organization/#software` I; `codeRepository` wijst naar een GitHub-organisatie, Codeberg onbevestigd I; BreadcrumbList/FAQPage op landingspagina's M; Mastodon-rel=me zonder `identity.verified`-controle en ook op aliaspagina's I.
5. **AI-ontdekking** — `llms.txt`/`llms-full.txt` bestaan, zonder ETag I; inhoud mist cryptografie, organisatieniveaus, vergelijking, licentie-uitleg I; robots.txt sluit `/u/`, `/admin/`, `/auth/` niet uit I.
6. **IndexNow** — M. Een melding vraagt om opname; ze garandeert geen indexering.
7. **Dynamische OG** — 1200×630 SVG/PNG C; vertrouwensniveaus niet zichtbaar I; caching zonder SWR/ETag, cache-lookup pas na de database-read I; workspace-OG gebruikt `select *` I.
8. **Open-web-vertrouwen** — oEmbed-provider, WebFinger, RFC 9116 security.txt en changelog-feed M.
9. **Prestaties, veiligheid, toegankelijkheid** — fonts lokaal C; dynamische `lang` C; speculationrules M; skip-link M; algemene securityheaders niet actief I; Stripe.js en externe embeds bestaan, dus "nul derde partijen" is niet waar zonder uitzondering I; CWV/WCAG niet gemeten.
10. **Regressietests** — sitemap-, redirect- en taaltests bestaan I; de vijf gevraagde suites (noindex, hreflang, lekken via graaf/oEmbed/WebFinger, host-isolatie, canonicals zonder query) M.

## Fases

| Fase | Inhoud | Bestanden (indicatief) | Tests |
|---|---|---|---|
| **S1 Antwoordrand** | Universele `X-Robots-Tag` op gevoelige paden en foutpagina's, 308-normalisatie, algemene securityheaders actief. CSP-aanscherping en HSTS-preload apart, na domeincontrole. | `src/server.ts`, `src/lib/security-headers.ts`, `src/start.ts` | antwoordmatrix per pad, redirecttests |
| **S2 URL- en privacycontracten** | Canonicals strippen query/fragment, echte 404, 410 alleen met echte verwijderstatus, agenda-sitemap zonder naamruimtekoppeling, rel=me alleen geverifieerd en per naamruimte, taalcodes in de database gereserveerd (aparte migratie, eigen GO). | `social-meta.ts`, `site.ts`, profiel-/workspace-heads, `sitemap-index.server.ts`, `reserved-slugs.ts` | canonical/query, 404/410, naamruimte, registerpariteit |
| **S3 Cache-first ontdekking** | Gedeelde ETag/304-helper; sitemap/robots/llms/OG; OG-cache vóór de database; minimale workspace-projectie. | routes `sitemap`, `robots`, `llms`, `api_.public.og.$handle.ts`, `og-profile.server.ts` | 304 en cachehit doen **nul** queries; fout publiceert nooit half resultaat |
| **S4 Meertalige landingspagina's** | Uitbreiding van `discover/topics.ts` (bron blijft één register), 16 URL's, wederzijdse hreflang, vergelijkingstabellen, zichtbare FAQ/breadcrumb. **Vraagt architectuurbeslissing** (AGENTS.md legt `/discover/<topic>` vast). | `src/lib/discover/*`, `discover.$topic.tsx`, sitemap | volledige taalmatrix, bestaande discover-links |
| **S5 Host-isolatie** | Allowlist van geverifieerde hosts, gecachte host-manifesten, eigen robots/sitemap per host, cachesleutels per host. **Vraagt architectuurbeslissing.** | `domain-routing.functions.ts`, `index.tsx`, `w.$slug.tsx`, robots/sitemaps | vijandige Host-header, cache-isolatie tussen tenants |
| **S6 Publieke diensten** | Graaf met stabiele ID's, oEmbed, WebFinger, security.txt (met vervaldatum, contact, PGP), changelog-feed, rijkere `llms-full.txt`. Alleen bevestigde feiten (repository). | `knowledge-graph.ts`, nieuwe `.well-known`-routes | schema-fixtures, lektests per naamruimte |
| **S7 Publiceren en kwaliteitspoorten** | IndexNow + sleutelroute, asynchroon en ontdubbeld vanuit bestaande publicaties; speculationrules, skip-link, mediamaten; Vitest verplicht in CI; gemeten CWV- en toetsenbordtests; derde partijen afschermen of expliciet uitzonderen. | publicatiehooks, root-shell, CI | a11y, CWV-meting, IndexNow-mock |

**Volgorde:** S1–S3 vóór meer crawlerverkeer; S4 en S5 pas na architectuurbeslissing; S6/S7 gebruiken hetzelfde privacy-veilige, cache-first publieke contract.

## Correcties op het aangeleverde plan

- "Onmiddellijke indexering" via IndexNow is niet gegarandeerd.
- ML-DSA-65 is echt aanwezig (`src/lib/support/hybrid-signature.ts`), maar beschermt niet alles post-quantum.
- AGPL-3.0 klopt (`LICENSE`); het bestaan van een Codeberg-repository is niet nagekeken.
- De graaf vermeldt nog een Cloudflare-runtime; productie draait op Vercel/Nitro.
