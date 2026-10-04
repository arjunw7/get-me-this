import Link from "next/link";

import { ArrowRightIcon } from "./icons";
import { Wordmark } from "./wordmark";
import { HeroCollage } from "./hero-collage";
import { GroupDemoSection } from "./group-demo";
import { CtaLink } from "./cta-link";
import {
  dashboardHref,
  dashboardLabel,
  finalCta,
  footer,
  hero,
  howItWorks,
  landingNav,
  loginHref,
  faqs,
  occasions,
  occasionTilts,
  startWishlistHref,
} from "./content";
import { loggedOutConfirmation } from "@/src/auth/flow-copy";

/** Public wishlist-first introduction; authentication remains intent-preserving. */
export function LandingPage({
  loggedOut = false,
  signedIn = false,
}: {
  loggedOut?: boolean;
  signedIn?: boolean;
}) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-surface-page text-content-primary">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Get Me This home">
          {/* V18 sizes the wordmark 24px→28px; 28px is not on the type
              scale, so the approved nearest step (text-3xl, 30px) is used. */}
          <Wordmark className="text-2xl sm:text-3xl" />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-6">
          {landingNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hidden text-sm font-semibold hover:underline md:inline"
            >
              {item.label}
            </a>
          ))}
          {signedIn ? (
            <Link
              href={dashboardHref}
              className="inline-flex h-11 items-center rounded-surface px-3 text-sm font-bold hover:bg-surface-sunken"
            >
              {dashboardLabel}
            </Link>
          ) : (
            <a
              href={loginHref}
              className="inline-flex h-11 items-center rounded-surface px-3 text-sm font-bold hover:bg-surface-sunken"
            >
              Log in
            </a>
          )}
        </nav>
      </header>

      <main>
        {/* The confirmed-logout confirmation (004e): rendered only for the
            `?loggedOut=1` return after sign-out; a normal visit renders nothing here. */}
        {loggedOut ? (
          <p
            role="status"
            className="mx-auto max-w-6xl px-5 pt-4 text-center text-sm font-bold text-content-primary sm:px-8"
          >
            {loggedOutConfirmation}
          </p>
        ) : null}
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pt-12">
          <div>
            <p className="text-base font-bold text-action-primary-strong">
              {hero.eyebrow}
            </p>
            <h1 className="mt-3 font-display text-display-xl sm:text-6xl lg:text-7xl">
              {hero.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-content-secondary">
              {hero.body}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaLink href={startWishlistHref} variant="primary" size="lg">
                {hero.primaryCta}
                <ArrowRightIcon className="h-5 w-5" />
              </CtaLink>
            </div>
          </div>
          <HeroCollage />
        </section>

        {/* How it works */}
        <section
          id="how"
          aria-labelledby="how-title"
          className="border-y-2 border-outline-strong bg-surface-raised"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2
              id="how-title"
              className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl"
            >
              {howItWorks.title}
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {howItWorks.steps.map((step, index) => (
                <li
                  key={step.title}
                  className="relative md:border-l-2 md:border-outline-strong md:pl-6"
                >
                  <span className="font-display text-6xl leading-none font-extrabold text-action-primary">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-display text-2xl font-bold">
                    {step.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-content-secondary">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <GroupDemoSection />

        {/* Occasions */}
        <section
          id="occasions"
          aria-labelledby="occasions-title"
          className="border-b-2 border-outline-strong"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-5 pt-20 pb-30 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div className="lg:order-2">
              <h2
                id="occasions-title"
                className="font-display text-4xl leading-[1.02] font-extrabold tracking-tight sm:text-5xl"
              >
                Any excuse to gift.
              </h2>
              <p className="mt-4 text-lg text-content-secondary">
                One wishlist, as many groups as you like. Use the same list for
                Eid, Diwali or someone’s chaotic housewarming.
              </p>
            </div>
            <ul className="flex flex-wrap gap-3 lg:order-1">
              {occasions.map((occasion, index) => (
                <li
                  key={occasion.label}
                  className={`rounded-surface border-2 border-outline-strong px-4 py-3 shadow-chunk-sm ${TONE_CLASS[occasion.tone]} ${occasionTilts[index % occasionTilts.length]}`}
                >
                  <p className="font-display text-lg leading-tight font-extrabold">
                    {occasion.label}
                  </p>
                  {/* V18 renders the electric tile's example at white/85 and
                      the others at ink-soft; both fail WCAG AA on their tile
                      fills, so the approved full-contrast tones are used. */}
                  <p
                    className={`text-sm ${occasion.tone === "electric" ? "text-surface-page" : "text-content-primary"}`}
                  >
                    &ldquo;{occasion.example}&rdquo;
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="questions-title"
          className="-mt-0.5 border-t-2 border-outline-strong bg-surface-raised"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2
                id="questions-title"
                className="font-display text-4xl font-extrabold tracking-tight"
              >
                A few good questions.
              </h2>
              <p className="mt-4 text-lg text-content-secondary">
                Your wishlist works on its own. Groups are for planning gifts
                together.
              </p>
            </div>
            <div className="divide-y-2 divide-outline-subtle">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-4">
                  <summary className="min-h-11 cursor-pointer content-center pr-2 font-bold">
                    {faq.question}
                  </summary>
                  <p className="pt-3 pb-2 leading-relaxed text-content-secondary">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-surface-2xl border-2 border-outline-strong bg-action-primary p-8 shadow-chunk-lg sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
                {finalCta.title}
              </h2>
              <p className="mt-3 text-lg font-medium">{finalCta.body}</p>
            </div>
            <CtaLink
              href={startWishlistHref}
              variant="subtle"
              size="lg"
              className="shrink-0"
            >
              {finalCta.cta}
              <ArrowRightIcon className="h-5 w-5" />
            </CtaLink>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-outline-strong">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-content-secondary sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark className="text-xl text-content-primary" />
          <p>{footer.tagline}</p>
        </div>
      </footer>
    </div>
  );
}

const TONE_CLASS = {
  marigold: "bg-accent-highlight",
  lime: "bg-accent-fresh",
  coral: "bg-action-primary",
  electric: "bg-accent-info text-surface-page",
  paper: "bg-surface-raised",
} as const;
