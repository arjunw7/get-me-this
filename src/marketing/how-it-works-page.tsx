import { GuideLinks } from "@/src/marketing/guide-links";
import Link from "next/link";
import { CtaLink } from "@/src/landing/cta-link";
import { ArrowRightIcon } from "@/src/landing/icons";
import { Wordmark } from "@/src/landing/wordmark";
import {
  createGroupHref,
  loginHref,
  startWishlistHref,
} from "@/src/landing/content";

const steps = [
  {
    title: "Add a gift idea",
    body: "Paste a product link, then check the name, photo and price. Add anything the shop didn’t provide yourself. Leave a note for details like size, colour or the version you want.",
    detail:
      "A link that won’t import doesn’t have to stop you. You can fill in the item details manually.",
  },
  {
    title: "Share your wishlist",
    body: "Open Share wishlist, copy your link and send it to friends. They can browse your saved items and notes without creating an account.",
    detail:
      "Your public link shows your wishlist. It never shows your groups, private assignments or gift reservations.",
  },
  {
    title: "Let friends choose",
    body: "Friends follow an item’s link to the original shop to check its current price, availability and delivery options. Purchases happen at that shop.",
    detail:
      "Keep the same wishlist as your ideas change. Edit, remove and reorder items without building a new list for every occasion.",
  },
];

const modes = [
  [
    "Draw names privately",
    "Each participating member gets one private recipient after the organizer runs the draw.",
  ],
  [
    "Gift everyone",
    "Each participant gets a private checklist of the other participants. The budget applies per recipient.",
  ],
  [
    "Share wishlists only",
    "Browse and plan gifts without assignments or a required checklist.",
  ],
];

const answers = [
  [
    "Do I need a group to use Get Me This?",
    "No. Create your wishlist and share its link. Groups help when you want to plan gifts together.",
  ],
  [
    "Do my friends need an account?",
    "They can view your public wishlist without signing in. They need to sign in to react, and join an eligible group to use its private gifting features. You can see reactions to your own items, but can’t react to them yourself.",
  ],
  [
    "Can I add things from different shops?",
    "Yes. Save links from different shops in the same wishlist. Imported information is editable, and manual entry is available when the shop’s details cannot be read.",
  ],
  [
    "Are the prices always current?",
    "Saved prices are useful references. Friends should check the original shop before buying. Currency conversions, where shown in a group, are approximate.",
  ],
  [
    "Does Get Me This sell or deliver gifts?",
    "You buy at the original shop. That shop handles payment, stock and delivery.",
  ],
];

export function HowItWorksPage() {
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
            <ol className="flex items-center gap-3">
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-touch-min min-w-touch-min items-center font-semibold underline underline-offset-4"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">How it works</li>
            </ol>
          </nav>
          <h1 className="max-w-4xl font-display text-display-xl sm:text-6xl">
            Make a wishlist. Share it with your people.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-content-secondary">
            Save the things you’d love from different shops in one place. Share
            your wishlist when someone asks what you want. Planning gifts
            together? Your wishlist comes with you into a private group.
          </p>
          <CtaLink href={startWishlistHref} className="mt-8">
            Create my wishlist <ArrowRightIcon className="h-5 w-5" />
          </CtaLink>
        </section>

        <section
          aria-labelledby="steps-title"
          className="border-y-2 border-outline-strong bg-surface-raised"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2
              id="steps-title"
              className="font-display text-3xl font-extrabold sm:text-4xl"
            >
              One wishlist for the things you’d love.
            </h2>
            <ol className="mt-10 grid gap-8 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-surface border-2 border-outline-strong bg-surface-page p-6 shadow-chunk-sm"
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-5xl font-extrabold text-action-primary-strong"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-display text-2xl font-bold">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-content-secondary">
                    {step.body}
                  </p>
                  <p className="mt-4 leading-relaxed text-content-secondary">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-2xl rounded-surface bg-surface-sunken px-5 py-4 text-content-secondary">
              A helpful item note: “The blue one, size M. Similar styles are
              welcome.”
            </p>
          </div>
        </section>

        <section
          aria-labelledby="groups-guide-title"
          className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20"
        >
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2
                id="groups-guide-title"
                className="font-display text-3xl font-extrabold sm:text-4xl"
              >
                Planning gifts together? Start a group.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-content-secondary">
                A group brings your friends’ individual wishlists into one
                private place. Set the occasion, date, budget and currency, then
                invite people with a link.
              </p>
              <p className="mt-4 leading-relaxed text-content-secondary">
                Choose how you want to give. Your existing wishlist works in
                every mode.
              </p>
              <CtaLink
                href={createGroupHref}
                variant="secondary"
                className="mt-8"
              >
                Create a group
              </CtaLink>
            </div>
            <ul className="space-y-4">
              {modes.map(([title, body]) => (
                <li
                  key={title}
                  className="rounded-surface border-2 border-outline-strong bg-surface-raised p-6"
                >
                  <h3 className="font-display text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-content-secondary">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-10 rounded-surface border-2 border-outline-strong bg-accent-highlight-soft p-6">
            <h3 className="font-display text-xl font-bold">
              Keep the surprise.
            </h3>
            <p className="mt-2 max-w-4xl leading-relaxed">
              Eligible group members can reserve a gift so other eligible givers
              in that group know it’s covered. The recipient never sees
              reservations or purchase progress about themselves. Reservations
              apply within that group; your public wishlist link has no
              reservation controls.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="visibility-title"
          className="border-y-2 border-outline-strong bg-surface-raised"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h2
              id="visibility-title"
              className="font-display text-3xl font-extrabold sm:text-4xl"
            >
              Who can see what?
            </h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-surface border-2 border-outline-strong p-6">
                <h3 className="font-display text-2xl font-bold">
                  Your public wishlist link
                </h3>
                <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-content-secondary">
                  <li>
                    Anyone with the active link can browse your profile name,
                    items and notes, without signing in.
                  </li>
                  <li>
                    Signed-in friends can react to your items. Public and group
                    reactions are separate.
                  </li>
                  <li>
                    No member lists, group details, private assignments or
                    reservations are shown.
                  </li>
                </ul>
              </div>
              <div className="rounded-surface border-2 border-outline-strong bg-surface-page p-6">
                <h3 className="font-display text-2xl font-bold">
                  A private group
                </h3>
                <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-content-secondary">
                  <li>
                    Joined members can browse wishlists in their permitted group
                    context.
                  </li>
                  <li>
                    Gifting assignments and checklists stay private to eligible
                    participants.
                  </li>
                  <li>
                    Eligible givers can reserve gifts. Reservation and purchase
                    progress stay hidden from the recipient.
                  </li>
                </ul>
              </div>
            </div>
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
            {answers.map(([question, answer]) => (
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
              Next time they ask what you want, send your wishlist.
            </h2>
            <CtaLink href={startWishlistHref} variant="subtle" className="mt-6">
              Create my wishlist <ArrowRightIcon className="h-5 w-5" />
            </CtaLink>
          </div>
        </section>
        <GuideLinks current="/how-it-works" />
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
