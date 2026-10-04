import Link from "next/link";
import { ArrowRightIcon } from "@/src/landing/icons";
import { guideIdentity, type GuidePath } from "./guides";

export function GuideLinks({ current }: { current?: GuidePath }) {
  const paths = (Object.keys(guideIdentity) as GuidePath[]).filter(
    (path) => path !== current,
  );
  return (
    <section
      aria-labelledby="related-guides-title"
      className="border-t-2 border-outline-strong bg-surface-raised"
    >
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <h2
          id="related-guides-title"
          className="font-display text-3xl font-extrabold sm:text-4xl"
        >
          {current ? "Keep exploring." : "Helpful guides."}
        </h2>
        <ul
          className={`mt-8 grid gap-5 md:grid-cols-2 ${current ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
        >
          {paths.map((path) => (
            <li key={path}>
              <Link
                href={path}
                className="group flex h-full min-h-touch-min flex-col rounded-surface border-2 border-outline-strong bg-surface-page p-5 shadow-chunk-sm transition-transform hover:-translate-y-1 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-outline-strong"
              >
                <span className="flex items-start justify-between gap-3 font-display text-xl font-bold">
                  {guideIdentity[path].label}
                  <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0" />
                </span>
                <span className="mt-3 leading-relaxed text-content-secondary">
                  {guideIdentity[path].summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
