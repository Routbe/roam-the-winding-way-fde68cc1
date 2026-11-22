/**
 * Localised press kit (/nl/pers, /fr/presse, /de/presse, /en/press).
 * Facts are limited to what the code base or the owner verifies; keep claims about hosting out
 * until the hosting location is confirmed.
 */
import { SITE_ORIGIN } from "@/lib/site";

export type PressLocale = "nl" | "fr" | "de" | "en";

export const PRESS_EMAIL = "press@rout.be";

export const PRESS_PATHS: Record<PressLocale, string> = {
  nl: "/nl/pers",
  fr: "/fr/presse",
  de: "/de/presse",
  en: "/en/press",
};

export const PRESS_LOCALES = Object.keys(PRESS_PATHS) as PressLocale[];

type Copy = {
  title: string;
  description: string;
  h1: string;
  summaryTitle: string;
  summary: [string, string, string];
  factsTitle: string;
  facts: [string, string][];
  whyTitle: string;
  why: string[];
  contactTitle: string;
  contactLead: string;
  languagesLabel: string;
  languages: string;
  locationLabel: string;
  location: string;
  brandKit: string;
  otherLanguages: string;
};

const ORIGIN_NAME = "Jona Zeno Delplanche / delplanche.cloud";

export const PRESS_COPY: Record<PressLocale, Copy> = {
  nl: {
    title: "Pers & media | ROUT",
    description: "Perskit van ROUT: samenvatting, feitenblad, waarom ROUT en perscontact press@rout.be (Brussel).",
    h1: "Pers & media",
    summaryTitle: "In drie zinnen",
    summary: [
      "ROUT (rout.be) is een Belgisch, open-source platform voor digitale identiteit, geverifieerde organisatieprofielen en QR-codes zonder trackers.",
      "Het biedt mensen, bedrijven en overheden een Europees alternatief voor Amerikaanse link-in-bio- en linkdiensten zoals Linktree en Bitly.",
      "ROUT combineert een gratis kern met post-quantum handtekeningen (Ed25519 + ML-DSA-65) en een verificatie in drie lagen tegen nepaccounts.",
    ],
    factsTitle: "Feitenblad",
    facts: [
      ["Naam", "ROUT"],
      ["Website", "https://rout.be"],
      ["Herkomst", `Brussel, België (initiatief van ${ORIGIN_NAME})`],
      ["Licentie", "Open source (AGPL-3.0)"],
      ["Tracking en advertenties", "Geen trackers, geen advertenties, geen cookiebanner"],
      ["Cryptografie", "Hybride post-quantum handtekeningen (Ed25519 + ML-DSA-65) en passkeys (WebAuthn)"],
      ["Organisatieverificatie", "3 lagen: domein (DNS), register (KBO/btw via VIES, LEI via GLEIF) en volmacht; bewijsstukken worden binnen 7 dagen vernietigd"],
      ["Prijs", "Kern gratis voor persoonlijk gebruik (€0)"],
    ],
    whyTitle: "Waarom ROUT?",
    why: [
      "Veel Belgische en Europese instellingen, scholen, media en organisaties gebruiken op sociale media een Amerikaanse link-in-bio-dienst. Die diensten bouwen bezoekersprofielen op en geven geen cryptografisch bewijs dat een pagina echt van de organisatie is.",
      "ROUT lost beide op: één snelle, rustige digitale voordeur zonder tracking, waar bezoekers met één tik kunnen nagaan of een organisatie of certificaat echt is.",
    ],
    contactTitle: "Perscontact & interviews",
    contactLead: "Voor persvragen, technische achtergrond, citaten of een demo:",
    languagesLabel: "Talen",
    languages: "Nederlands, Frans, Engels",
    locationLabel: "Locatie",
    location: "Brussel, België",
    brandKit: "Logo's, kleuren en standaardtekst",
    otherLanguages: "Andere talen",
  },
  fr: {
    title: "Presse & médias | ROUT",
    description: "Kit presse de ROUT : résumé, fiche d'information, pourquoi ROUT et contact presse press@rout.be (Bruxelles).",
    h1: "Presse & médias",
    summaryTitle: "En trois phrases",
    summary: [
      "ROUT (rout.be) est une plateforme belge et open source d'identité numérique, de profils d'organisation vérifiés et de codes QR sans traceurs.",
      "Elle offre aux citoyens, aux entreprises et aux pouvoirs publics une alternative européenne aux services américains de lien en bio et de liens courts comme Linktree et Bitly.",
      "ROUT associe un socle gratuit à des signatures post-quantiques (Ed25519 + ML-DSA-65) et à une vérification en trois niveaux contre les faux comptes.",
    ],
    factsTitle: "Fiche d'information",
    facts: [
      ["Nom", "ROUT"],
      ["Site web", "https://rout.be"],
      ["Origine", `Bruxelles, Belgique (initiative de ${ORIGIN_NAME})`],
      ["Licence", "Open source (AGPL-3.0)"],
      ["Traçage et publicité", "Aucun traceur, aucune publicité, aucune bannière de cookies"],
      ["Cryptographie", "Signatures post-quantiques hybrides (Ed25519 + ML-DSA-65) et passkeys (WebAuthn)"],
      ["Vérification des organisations", "3 niveaux : domaine (DNS), registre (BCE/TVA via VIES, LEI via GLEIF) et mandat ; les pièces justificatives sont détruites sous 7 jours"],
      ["Prix", "Socle gratuit pour un usage personnel (0 €)"],
    ],
    whyTitle: "Pourquoi ROUT ?",
    why: [
      "De nombreuses institutions, écoles, médias et organisations belges et européens utilisent sur les réseaux sociaux un service américain de lien en bio. Ces services construisent des profils de visiteurs et n'apportent aucune preuve cryptographique qu'une page appartient réellement à l'organisation.",
      "ROUT résout les deux : une porte d'entrée numérique rapide et sobre, sans traçage, où les visiteurs vérifient d'un geste l'authenticité d'une organisation ou d'un certificat.",
    ],
    contactTitle: "Contact presse & interviews",
    contactLead: "Pour les questions de presse, le contexte technique, des citations ou une démo :",
    languagesLabel: "Langues",
    languages: "néerlandais, français, anglais",
    locationLabel: "Lieu",
    location: "Bruxelles, Belgique",
    brandKit: "Logos, couleurs et texte de présentation",
    otherLanguages: "Autres langues",
  },
  de: {
    title: "Presse & Medien | ROUT",
    description: "Pressemappe von ROUT: Kurzfassung, Faktenblatt, warum ROUT und Pressekontakt press@rout.be (Brüssel).",
    h1: "Presse & Medien",
    summaryTitle: "In drei Sätzen",
    summary: [
      "ROUT (rout.be) ist eine belgische Open-Source-Plattform für digitale Identität, verifizierte Organisationsprofile und trackerfreie QR-Codes.",
      "Sie bietet Menschen, Unternehmen und Behörden eine europäische Alternative zu US-amerikanischen Link-in-Bio- und Kurzlinkdiensten wie Linktree und Bitly.",
      "ROUT verbindet einen kostenlosen Kern mit Post-Quanten-Signaturen (Ed25519 + ML-DSA-65) und einer dreistufigen Verifizierung gegen Fake-Accounts.",
    ],
    factsTitle: "Faktenblatt",
    facts: [
      ["Name", "ROUT"],
      ["Website", "https://rout.be"],
      ["Herkunft", `Brüssel, Belgien (Initiative von ${ORIGIN_NAME})`],
      ["Lizenz", "Open Source (AGPL-3.0)"],
      ["Tracking und Werbung", "Keine Tracker, keine Werbung, kein Cookie-Banner"],
      ["Kryptografie", "Hybride Post-Quanten-Signaturen (Ed25519 + ML-DSA-65) und Passkeys (WebAuthn)"],
      ["Organisationsprüfung", "3 Stufen: Domain (DNS), Register (KBO/USt über VIES, LEI über GLEIF) und Vollmacht; Nachweise werden innerhalb von 7 Tagen vernichtet"],
      ["Preis", "Kern kostenlos für den privaten Gebrauch (0 €)"],
    ],
    whyTitle: "Warum ROUT?",
    why: [
      "Viele belgische und europäische Einrichtungen, Schulen, Medien und Organisationen nutzen in sozialen Netzwerken einen US-amerikanischen Link-in-Bio-Dienst. Diese Dienste erstellen Besucherprofile und bieten keinen kryptografischen Nachweis, dass eine Seite wirklich zur Organisation gehört.",
      "ROUT löst beides: eine schnelle, ruhige digitale Eingangstür ohne Tracking, an der Besucher mit einem Tipp prüfen, ob eine Organisation oder ein Zertifikat echt ist.",
    ],
    contactTitle: "Pressekontakt & Interviews",
    contactLead: "Für Presseanfragen, technischen Hintergrund, Zitate oder eine Demo:",
    languagesLabel: "Sprachen",
    languages: "Niederländisch, Französisch, Englisch",
    locationLabel: "Standort",
    location: "Brüssel, Belgien",
    brandKit: "Logos, Farben und Boilerplate",
    otherLanguages: "Andere Sprachen",
  },
  en: {
    title: "Press & media | ROUT",
    description: "ROUT press kit: summary, fact sheet, why ROUT and press contact press@rout.be (Brussels).",
    h1: "Press & media",
    summaryTitle: "In three sentences",
    summary: [
      "ROUT (rout.be) is a Belgian open-source platform for digital identity, verified organisation profiles and tracker-free QR codes.",
      "It gives people, companies and governments a European alternative to US link-in-bio and link services such as Linktree and Bitly.",
      "ROUT combines a free core with post-quantum signatures (Ed25519 + ML-DSA-65) and three-layer verification against fake accounts.",
    ],
    factsTitle: "Fact sheet",
    facts: [
      ["Name", "ROUT"],
      ["Website", "https://rout.be"],
      ["Origin", `Brussels, Belgium (initiative of ${ORIGIN_NAME})`],
      ["Licence", "Open source (AGPL-3.0)"],
      ["Tracking and ads", "No trackers, no ads, no cookie banner"],
      ["Cryptography", "Hybrid post-quantum signatures (Ed25519 + ML-DSA-65) and passkeys (WebAuthn)"],
      ["Organisation verification", "3 layers: domain (DNS), registry (KBO/VAT via VIES, LEI via GLEIF) and mandate; evidence is destroyed within 7 days"],
      ["Price", "Core free for personal use (€0)"],
    ],
    whyTitle: "Why ROUT?",
    why: [
      "Many Belgian and European institutions, schools, media and organisations use a US link-in-bio service on social media. Those services build visitor profiles and offer no cryptographic proof that a page really belongs to the organisation.",
      "ROUT solves both: one fast, calm digital front door without tracking, where visitors can check with one tap whether an organisation or certificate is genuine.",
    ],
    contactTitle: "Press contact & interviews",
    contactLead: "For press questions, technical background, quotes or a demo:",
    languagesLabel: "Languages",
    languages: "Dutch, French, English",
    locationLabel: "Location",
    location: "Brussels, Belgium",
    brandKit: "Logos, colours and boilerplate",
    otherLanguages: "Other languages",
  },
};

const LANG_NAMES: Record<PressLocale, string> = { nl: "Nederlands", fr: "Français", de: "Deutsch", en: "English" };
export const pressLanguageName = (l: PressLocale) => LANG_NAMES[l];

/** Head tags: self canonical, reciprocal hreflang (x-default → English) and a press ContactPoint. */
export function pressHead(locale: PressLocale) {
  const c = PRESS_COPY[locale];
  // Search engines ignore relative hreflang/canonical URLs, so every link is absolute.
  const abs = (l: PressLocale) => `${SITE_ORIGIN}${PRESS_PATHS[l]}`;
  const url = abs(locale);
  return {
    meta: [
      { title: c.title },
      { name: "description", content: c.description },
      { property: "og:title", content: c.title },
      { property: "og:description", content: c.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: url },
      ...PRESS_LOCALES.map((l) => ({ rel: "alternate", hrefLang: l, href: abs(l) })),
      { rel: "alternate", hrefLang: "x-default", href: abs("en") },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ROUT",
          url: "https://rout.be",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "press",
            email: PRESS_EMAIL,
            availableLanguage: ["nl", "fr", "en"],
            areaServed: "BE",
          },
        }),
      },
    ],
  };
}
