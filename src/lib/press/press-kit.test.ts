import { describe, expect, it } from "vitest";
import { PRESS_EMAIL, PRESS_LOCALES, pressHead } from "./press-kit";

const EXPECTED = {
  nl: "https://rout.be/nl/pers",
  fr: "https://rout.be/fr/presse",
  de: "https://rout.be/de/presse",
  en: "https://rout.be/en/press",
} as const;

describe("press kit head", () => {
  it("every language page links all four versions with absolute hreflang URLs and x-default English", () => {
    for (const locale of PRESS_LOCALES) {
      const links = pressHead(locale).links;
      const alternates = Object.fromEntries(
        links.filter((l) => l.rel === "alternate").map((l) => [l.hrefLang, l.href]),
      );
      expect(alternates).toEqual({ ...EXPECTED, "x-default": EXPECTED.en });
      expect(links.find((l) => l.rel === "canonical")?.href).toBe(EXPECTED[locale]);
    }
  });

  it("publishes press@rout.be as a press ContactPoint in Dutch, French and English", () => {
    const script = pressHead("nl").scripts[0];
    const ld = JSON.parse(script?.children ?? "{}");
    expect(PRESS_EMAIL).toBe("press@rout.be");
    expect(ld.contactPoint).toMatchObject({ contactType: "press", email: "press@rout.be", availableLanguage: ["nl", "fr", "en"] });
  });
});
