import { createGroupHref, groupCopy } from "./content";
import { CtaLink } from "./cta-link";
import { CheckIcon, EyeOffIcon } from "./icons";

export function GroupDemoSection() {
  return (
    <section
      id="groups"
      aria-labelledby="groups-title"
      className="mx-auto max-w-6xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-action-primary-strong">
            An optional next step
          </p>
          <h2
            id="groups-title"
            className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            {groupCopy.title}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-content-secondary">
            {groupCopy.body}
          </p>
          <ul className="mt-7 space-y-5">
            {groupCopy.benefits.map((benefit) => (
              <li key={benefit.title} className="flex gap-3">
                <CheckIcon className="mt-1 h-5 w-5 shrink-0" />
                <div>
                  <h3 className="font-bold">{benefit.title}</h3>
                  <p className="mt-1 text-content-secondary">{benefit.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CtaLink href={createGroupHref} variant="secondary">
              Create a group
            </CtaLink>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-content-secondary">
            Browse wishlists, draw names privately, or plan a gift for everyone.
          </p>
        </div>
        <figure
          aria-label="Example private group: Birthday crew"
          className="rounded-surface-xl border-2 border-outline-strong bg-surface-raised shadow-chunk-lg"
        >
          <div className="rounded-t-surface-xl border-b-2 border-outline-strong bg-accent-highlight p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider">
              Private group · illustration
            </p>
            <h3 className="mt-2 font-display text-3xl font-extrabold">
              Birthday crew
            </h3>
            <p className="mt-1 text-sm">Your people. Their own wishlists.</p>
          </div>
          <div className="p-5 sm:p-6">
            <ul className="grid grid-cols-3 gap-2 border-b-2 border-outline-subtle pb-5">
              {[
                { name: "Aanya", initials: "AM", color: "bg-action-primary" },
                {
                  name: "Kabir",
                  initials: "KK",
                  color: "bg-accent-info text-surface-page",
                },
                { name: "Zoya", initials: "ZS", color: "bg-accent-highlight" },
              ].map((person) => (
                <li key={person.name} className="text-center">
                  <span
                    aria-hidden="true"
                    className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-outline-strong font-bold ${person.color}`}
                  >
                    {person.initials}
                  </span>
                  <p className="text-sm font-bold">{person.name}’s</p>
                  <p className="text-xs text-content-secondary">wishlist</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 font-bold">A gift from Kabir’s wishlist</p>
            <p className="mt-1 text-sm text-content-secondary">
              Matte black gooseneck kettle
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-surface border-2 border-outline-strong bg-accent-fresh p-4">
                <p className="text-xs font-bold uppercase tracking-wide">
                  Another group member sees
                </p>
                <p className="mt-2 flex items-center gap-2 font-bold">
                  <CheckIcon className="h-4 w-4" />
                  Reserved · someone’s getting it
                </p>
              </div>
              <div className="rounded-surface border-2 border-outline-strong bg-surface-page p-4">
                <p className="text-xs font-bold uppercase tracking-wide">
                  Kabir sees
                </p>
                <p className="mt-2 flex items-center gap-2 font-bold">
                  <EyeOffIcon className="h-4 w-4" />
                  His wishlist. No reservation details.
                </p>
              </div>
            </div>
            <figcaption className="mt-4 text-sm text-content-secondary">
              Reservations only appear inside the group, never on a public
              wishlist.
            </figcaption>
          </div>
        </figure>
      </div>
      <p className="mt-12 text-center text-sm font-semibold text-content-secondary">
        Birthdays · Diwali · Eid · Secret Santa · Just because
      </p>
    </section>
  );
}
