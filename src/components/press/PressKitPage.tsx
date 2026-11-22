import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PRESS_COPY, PRESS_EMAIL, PRESS_LOCALES, PRESS_PATHS, pressLanguageName, type PressLocale } from "@/lib/press/press-kit";

export function PressKitPage({ locale }: { locale: PressLocale }) {
  const c = PRESS_COPY[locale];
  return (
    <AppLayout>
      <article lang={locale} className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="font-display text-4xl text-foreground sm:text-5xl">{c.h1}</h1>

        <nav aria-label={c.otherLanguages} className="mt-4 flex flex-wrap gap-2 text-sm">
          {PRESS_LOCALES.map((l) => (
            <a
              key={l}
              href={PRESS_PATHS[l]}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-muted-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
            >
              {pressLanguageName(l)}
            </a>
          ))}
        </nav>

        <section className="mt-12" aria-labelledby="summary">
          <h2 id="summary" className="font-display text-2xl text-foreground">{c.summaryTitle}</h2>
          <div className="mt-4 space-y-3 text-base leading-relaxed text-foreground">
            {c.summary.map((s) => <p key={s}>{s}</p>)}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="facts">
          <h2 id="facts" className="font-display text-2xl text-foreground">{c.factsTitle}</h2>
          <dl className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
            {c.facts.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
                <dt className="text-sm font-medium text-muted-foreground">{k}</dt>
                <dd className="text-sm text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12" aria-labelledby="why">
          <h2 id="why" className="font-display text-2xl text-foreground">{c.whyTitle}</h2>
          <div className="mt-4 space-y-3 text-base leading-relaxed text-foreground">
            {c.why.map((s) => <p key={s}>{s}</p>)}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="contact">
          <h2 id="contact" className="font-display text-2xl text-foreground">{c.contactTitle}</h2>
          <p className="mt-3 text-muted-foreground">{c.contactLead}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="sr-only">E-mail</dt>
              <dd>
                <a href={`mailto:${PRESS_EMAIL}`} className="inline-flex min-h-11 items-center gap-2 text-lg text-foreground underline underline-offset-4">
                  <Mail className="h-4 w-4" aria-hidden /> {PRESS_EMAIL}
                </a>
              </dd>
            </div>
            <div className="flex gap-2"><dt className="text-muted-foreground">{c.languagesLabel}:</dt><dd className="text-foreground">{c.languages}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">{c.locationLabel}:</dt><dd className="text-foreground">{c.location}</dd></div>
          </dl>
          <p className="mt-8">
            <Link to="/press" className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4">{c.brandKit} →</Link>
          </p>
        </section>
      </article>
    </AppLayout>
  );
}
