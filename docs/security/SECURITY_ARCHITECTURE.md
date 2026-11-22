# Beveiligingslagen ROUT — stand en plan (alleen plan, nog geen code)

Bron: code-audit en live headercontrole van https://rout.be en /login op 2026-11-22 (alleen lezen).
"Aanwezig" = in de broncode, niet bewezen in productie. "Ontbreekt" = niet gevonden in de onderzochte code.
Instellingen bij GitHub, Vercel of Neon zijn van hieruit niet te controleren.

## Live vastgesteld

`/` en `/login`: alleen `strict-transport-security: max-age=63072000`. Geen CSP, COOP, COEP, CORP, nosniff, Referrer-Policy of Permissions-Policy. De regels in `src/lib/security-headers.ts` worden alleen op `/secure/*` gebruikt (`src/server.ts`).

## Stand per laag

| Laag | Stand | Wat ontbreekt |
|---|---|---|
| Toeleveringsketen | Deels: `bun.lock`, `Cargo.lock`, `--frozen-lockfile`, reproduceerbare Wasm-CI met SHA-384-pins | `--ignore-scripts`, actions op commit-SHA, cargo-deny/cargo-vet, brede dependency-CI |
| Hardware-ondertekende commits | Niet te controleren | Branch protection en verplichte handtekeningen zitten in GitHub-instellingen |
| Trusted Types | Ontbreekt | Geen `require-trusted-types-for`; inline scripts toegestaan |
| COOP/COEP/CORP | Deels: alleen `/secure/*` en login/instellingen | Niet algemeen, niet live gezien |
| Aparte origins (bestanden, avatars, admin) | Deels: `admin` gereserveerd als subdomein | Geen afgedwongen aparte origin |
| Fetch Metadata / CSRF | Deels: CSRF-middleware op server-functies | Geen `Sec-Fetch-Site`-poort op alle muterende API-routes |
| Geen IP-logging | Deels: dagelijkse HMAC-sleutels voor limieten, gehashte IP in audit | Tellers in de database, terugval naar gewone SHA-256 zonder HMAC-sleutel, audit-hash niet dagelijks geroteerd, Better Auth leest IP-headers |
| Antwoordpadding | Deels: boekingen in vaste blokken (1/4/16 KiB) | Geen algemene HTTP-padding |
| Constante tijd en geheugen | Deels: `subtle` in Rust, zeroize in OPAQUE, wissen in `finally` | Geen `mlock`; browsergeheugen is niet te vergrendelen |
| KEK-versies | Deels voor de kluis (`kid`, `kek_id`) | Geen rotatieprocedure; bewijsstukken (REV1) dragen geen KEK-id |
| Tripwire / noodstop | Deels: limieten, optioneel fail-closed | Geen automatische detectie die sessies bevriest en alarmeert |
| Noodintrekkingssleutel | Ontbreekt | Geen offline noodsleutel |
| Publiek Merkle-transparantielog | Deels: treasury-Merkle met hybride handtekening, hash-keten in audit | Geen log voor alle organisatie-attesten met consistentiebewijzen |
| Offline root / drempelhandtekening | Ontbreekt | Ondertekensleutels komen van een online master |
| SD-JWT / BBS+ | Bouwstenen aanwezig | Nog geen product voor organisatie-eigenschappen |
| Fuzzing en provenance | Deels: fast-check, TLA+-workflow | Geen continue cargo-fuzz, geen SLSA-provenance |
| Ondertekend `/.well-known/rout-trust.json` | Ontbreekt | — |
| EU-soevereine hosting | Niet vastgesteld | Live antwoorden komen van Vercel |

## Voorgestelde fases (elk met eigen GO)

| Fase | Inhoud | Risico |
|---|---|---|
| **B1 Headers overal** | Algemene securityheaders + nosniff, Referrer-Policy, Permissions-Policy op elk antwoord; samen met SEO-fase S1. | Laag; CSP eerst in report-only |
| **B2 CSP en Trusted Types** | Nonces in plaats van `unsafe-inline`, Trusted Types in report-only, daarna afdwingen; Stripe en embeds expliciet. | Middel: kan pagina's breken, dus meten eerst |
| **B3 Fetch Metadata** | `Sec-Fetch-Site`-poort voor alle muterende `/api`-routes behalve publieke webhooks met eigen handtekening. | Laag |
| **B4 Privacy van logs** | HMAC-sleutel verplicht (geen SHA-256-terugval), dagelijkse rotatie van audit-hashes, Better Auth zonder ruwe IP-opslag. | Laag; vraagt geheim op eigen infrastructuur |
| **B5 Sleutelbeheer** | KEK-id in bewijsstuk-envelop (nieuw formaat naast REV1), rotatie- en herverpakprocedure, offline noodsleutel. | Middel; migratie met eigen GO |
| **B6 Toeleveringsketen** | Actions op commit-SHA, `--ignore-scripts` met allowlist, cargo-deny, SLSA-provenance in CI. | Laag |
| **B7 Transparantie** | Publiek log voor organisatie-attesten en intrekkingen, ondertekend `rout-trust.json`. | Middel; nieuw ontwerp |
| **B8 Detectie** | Tripwire op ongewoon veel profiel- of sleutelreads die sessies bevriest en de eigenaar waarschuwt. | Middel; vals alarm vermijden |

Niet vanuit Lovable te doen: hardware-ondertekende commits afdwingen (GitHub), verhuizing naar EU-eigen hosting, offline sleutelceremonie.
