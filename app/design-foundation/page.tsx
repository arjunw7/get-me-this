import type { Metadata } from "next";

import {
  buttonSamples,
  colorSwatches,
  designFixture,
  motionNotes,
  surfaceSamples,
  typeSamples,
} from "@/src/foundation/design-fixture";
import { Button, Surface, TextAreaField, TextField, TextLink } from "@/src/ui";

export const metadata: Metadata = {
  title: "Get Me This | Design foundation",
  description:
    "Deterministic fixture for the Get Me This design tokens and interface primitives.",
};

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="font-display text-display-sm">
      {children}
    </h2>
  );
}

export default function DesignFoundationPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-gutter py-10 lg:px-gutter-lg lg:py-14">
      <header className="flex flex-col gap-3">
        <p className="font-display text-caption tracking-[0.08em] text-content-muted uppercase">
          {designFixture.eyebrow}
        </p>
        <h1 className="font-display text-display-lg">{designFixture.title}</h1>
        <p className="max-w-2xl text-body text-content-secondary">
          {designFixture.description}
        </p>
      </header>

      <section aria-labelledby="type-scale" className="flex flex-col gap-4">
        <SectionHeading id="type-scale">Type scale</SectionHeading>
        <Surface>
          <dl className="flex flex-col gap-4">
            {typeSamples.map((sample) => (
              <div
                key={sample.id}
                className="flex flex-col gap-1 border-t border-outline-subtle pt-4 first:border-t-0 first:pt-0"
              >
                <dt className="text-caption text-content-muted">
                  {sample.token}
                </dt>
                <dd className={sample.className}>{sample.sample}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </section>

      <section aria-labelledby="colour" className="flex flex-col gap-4">
        <SectionHeading id="colour">Colour</SectionHeading>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {colorSwatches.map((swatch) => (
            <li key={swatch.id} className="flex flex-col gap-2">
              <span
                aria-hidden="true"
                className={`h-16 rounded-control border-[length:var(--border-strong)] border-outline-strong ${swatch.className}`}
              />
              <span className="text-caption text-content-secondary">
                {swatch.token}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <SectionHeading id="buttons">Buttons</SectionHeading>
        <Surface>
          <div className="flex flex-wrap items-center gap-4">
            {buttonSamples.map((sample) => (
              <Button
                key={sample.id}
                variant={sample.variant}
                size={sample.size}
                disabled={sample.disabled}
              >
                {sample.label}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-caption text-content-secondary">
            Disabled buttons use the native disabled attribute, so they are
            skipped by keyboard navigation and cannot be activated.
          </p>
        </Surface>
      </section>

      <section aria-labelledby="fields" className="flex flex-col gap-4">
        <SectionHeading id="fields">Fields</SectionHeading>
        <Surface>
          <div className="grid gap-6 lg:grid-cols-2">
            <TextField
              id="fixture-empty"
              label="Item name"
              placeholder="e.g. Mushroom ceramic lamp"
              hint="Placeholders are examples, never labels."
              defaultValue=""
            />
            <TextField
              id="fixture-filled"
              label="Retailer"
              defaultValue="Etsy"
            />
            <TextField
              id="fixture-error"
              label="Price"
              inputMode="decimal"
              defaultValue="twelve"
              error="Numbers only, please."
            />
            <TextField
              id="fixture-disabled"
              label="Currency"
              defaultValue="INR"
              disabled
            />
            <div className="lg:col-span-2">
              <TextAreaField
                id="fixture-note"
                label="Note for your people"
                placeholder="Anything they should know?"
                defaultValue=""
              />
            </div>
          </div>
        </Surface>
      </section>

      <section aria-labelledby="links" className="flex flex-col gap-4">
        <SectionHeading id="links">Links</SectionHeading>
        <Surface>
          <p className="flex flex-wrap gap-6 text-body">
            <TextLink href="/">Internal link</TextLink>
            <TextLink href="https://www.w3.org/WAI/WCAG22/quickref/" external>
              External link
            </TextLink>
          </p>
        </Surface>
      </section>

      <section aria-labelledby="surfaces" className="flex flex-col gap-4">
        <SectionHeading id="surfaces">Surfaces and elevation</SectionHeading>
        <div className="grid gap-6 lg:grid-cols-3">
          {surfaceSamples.map((sample) => (
            <Surface
              key={sample.id}
              tone={sample.tone}
              elevation={sample.elevation}
            >
              <h3 className="font-display text-heading">{sample.heading}</h3>
              <p className="mt-2 text-caption text-content-secondary">
                Chunky radius, ink outline, offset shadow.
              </p>
            </Surface>
          ))}
        </div>
      </section>

      <section aria-labelledby="motion" className="flex flex-col gap-4">
        <SectionHeading id="motion">Motion and responsiveness</SectionHeading>
        <Surface tone="sunken">
          <ul className="flex flex-col gap-2 text-body text-content-secondary">
            {motionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="mt-4 text-caption text-content-muted">
            This fixture uses the gutter tokens, so page padding widens from the
            mobile gutter to the desktop gutter at the large breakpoint.
          </p>
        </Surface>
      </section>
    </main>
  );
}
