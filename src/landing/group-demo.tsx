/* eslint-disable @next/next/no-img-element -- original local marketing assets. */
import type { ReactNode } from "react";
import { Avatar } from "./avatar";
import { AvatarStack } from "./avatar-stack";
import { demoGroup, demoPeople, demoProducts } from "./demo-data";
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
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
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
          <ol className="mt-7 space-y-5">
            {groupCopy.benefits.map((benefit, index) => (
              <li key={benefit.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-action-primary font-display text-sm font-extrabold">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold">{benefit.title}</h3>
                  <p className="mt-1 text-content-secondary">{benefit.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <CtaLink href={createGroupHref} variant="secondary">
              Create a group
            </CtaLink>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-content-secondary">
            Browse wishlists, draw names privately, or plan a gift for everyone.
          </p>
        </div>
        <div className="sm:pl-8 lg:pl-4">
          <GroupSnapshot />
        </div>
      </div>
    </section>
  );
}

function DemoTile({
  productId,
  children,
  dim = false,
}: {
  productId: keyof typeof demoProducts;
  children?: ReactNode;
  dim?: boolean;
}) {
  const product = demoProducts[productId];
  return (
    <li className="relative min-w-0">
      <img
        src={product.image}
        alt=""
        className={`aspect-square w-full rounded-surface border-2 object-cover ${
          dim ? "border-outline-strong/20 opacity-45" : "border-outline-strong"
        }`}
      />
      {children}
      <p className="mt-2 truncate text-sm font-bold">{product.title}</p>
      <p className="text-xs font-semibold tabular-nums text-content-muted">
        {product.priceDisplay}
      </p>
    </li>
  );
}

function GroupSnapshot() {
  const joined = Object.values(demoPeople).filter(
    (person) => person.status === "joined",
  );
  return (
    <figure
      aria-label={demoGroup.ariaLabel}
      className="relative rounded-surface-xl border-2 border-outline-strong bg-surface-raised shadow-chunk-lg"
    >
      <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-t-surface-xl border-b-2 border-outline-strong bg-accent-highlight px-5 py-4">
        <div>
          <p className="font-display text-2xl leading-tight font-extrabold">
            {demoGroup.name}
          </p>
          <p className="text-sm font-semibold">{demoGroup.meta}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative rounded-full border-2 border-outline-strong bg-surface-page px-3 py-1 text-sm font-bold tabular-nums">
            {demoGroup.budgetDisplay}
          </span>
          <AvatarStack people={joined} size="xs" />
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <div className="relative">
          <p className="flex items-center gap-2 font-display font-extrabold">
            <Avatar person={demoPeople.kabir} size="xs" /> Kabir&rsquo;s
            wishlist
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
            <DemoTile productId="k-kettle">
              <span className="absolute top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-outline-strong bg-accent-fresh px-2 py-0.5 text-caption font-bold whitespace-nowrap">
                <CheckIcon className="h-3 w-3" strokeWidth={3} />
                Reserved by you
              </span>
            </DemoTile>
            <DemoTile productId="k-vinyl" />
            <DemoTile productId="k-bonsai" dim>
              <span className="absolute inset-x-1.5 top-2 rounded-full bg-outline-strong px-2 py-0.5 text-center text-caption font-bold text-surface-page">
                Over budget
              </span>
            </DemoTile>
          </ul>
          <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-xs font-bold">
            <EyeOffIcon className="h-3.5 w-3.5" />
            Kabir sees his list, but none of the reservations
          </p>
        </div>

        <div>
          <p className="flex items-center gap-2 font-display font-extrabold">
            <Avatar person={demoPeople.zoya} size="xs" /> Zoya&rsquo;s wishlist
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
            <DemoTile productId="z-claws">
              <span className="absolute top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-outline-strong bg-surface-raised px-2 py-0.5 text-caption font-bold whitespace-nowrap">
                <EyeOffIcon className="h-3 w-3" />
                Taken
              </span>
            </DemoTile>
            <DemoTile productId="r-cups" />
            <DemoTile productId="z-camera" dim>
              <span className="absolute inset-x-1.5 top-2 rounded-full bg-outline-strong px-2 py-0.5 text-center text-caption font-bold text-surface-page">
                Over budget
              </span>
            </DemoTile>
          </ul>
        </div>
      </div>
    </figure>
  );
}
