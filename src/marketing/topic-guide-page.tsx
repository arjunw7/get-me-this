import Link from "next/link";
import { CtaLink } from "@/src/landing/cta-link";
import { ArrowRightIcon } from "@/src/landing/icons";
import { Wordmark } from "@/src/landing/wordmark";
import { loginHref } from "@/src/landing/content";
import { GuideLinks } from "./guide-links";
import { guideIdentity, topicGuides, type TopicGuidePath } from "./guides";

export function TopicGuidePage({ path }: { path: TopicGuidePath }) {
  const guide = topicGuides[path];
  return (
    <div className="min-h-screen bg-surface-page text-content-primary">
      <a
        href="#guide-content"
        className="sr-only rounded-control bg-surface-raised p-4 focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="Get Me This home"
          className="inline-flex min-h-touch-min min-w-touch-min items-center"
        >
          <Wordmark className="text-2xl sm:text-3xl" />
        </Link>
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center rounded-control px-3 font-bold hover:bg-surface-sunken"
        >
          Log in
        </Link>
      </header>
      <main id="guide-content">
        <section className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-8 sm:pt-12">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 text-sm text-content-secondary"
          >
            <ol className="flex flex-wrap items-center gap-3">
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-touch-min min-w-touch-min items-center font-semibold underline underline-offset-4"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{guideIdentity[path].label}</li>
            </ol>
          </nav>
          <h1 className="max-w-4xl font-display text-display-xl sm:text-6xl">
            {guide.heading}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-content-secondary">
            {guide.intro}
          </p>
          <CtaLink href={guide.href} className="mt-8">
            {guide.cta}
            <ArrowRightIcon className="h-5 w-5" />
          </CtaLink>
        </section>
        <section
          aria-label={`${guideIdentity[path].label} guide`}
          className="border-y-2 border-outline-strong bg-surface-raised"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-12">
            {guide.sections.map((section) => (
              <div key={section.title}>
                <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
                  {section.title}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-4 leading-relaxed text-content-secondary"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.examples ? (
                  <ul className="mt-5 space-y-3">
                    {section.examples.map((example) => (
                      <li
                        key={example}
                        className="rounded-control bg-surface-sunken px-4 py-3 leading-relaxed"
                      >
                        {example}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="guide-questions-title"
          className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
        >
          <h2
            id="guide-questions-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            A few useful answers.
          </h2>
          <div className="divide-y-2 divide-outline-subtle">
            {guide.answers.map(([question, answer]) => (
              <details key={question} className="py-4">
                <summary className="min-h-11 cursor-pointer content-center pr-2 font-bold">
                  {question}
                </summary>
                <p className="pt-3 pb-2 leading-relaxed text-content-secondary">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="rounded-surface-2xl border-2 border-outline-strong bg-action-primary p-8 shadow-chunk-lg sm:p-12">
            <h2 className="max-w-3xl font-display text-3xl font-extrabold sm:text-4xl">
              {path === "/secret-santa"
                ? "Bring your people. Keep the surprise."
                : "Good gifts start with a wishlist."}
            </h2>
            <CtaLink href={guide.href} variant="subtle" className="mt-6">
              {guide.cta}
              <ArrowRightIcon className="h-5 w-5" />
            </CtaLink>
          </div>
        </section>
        <GuideLinks current={path} />
      </main>
      <footer className="border-t-2 border-outline-strong">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link
            href="/"
            aria-label="Get Me This home"
            className="inline-flex min-h-touch-min min-w-touch-min items-center"
          >
            <Wordmark className="text-xl" />
          </Link>
          <p className="text-content-secondary">
            Your wishlist. Your people. Better gifts.
          </p>
        </div>
      </footer>
    </div>
  );
}
