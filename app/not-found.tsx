import { TextLink } from "@/src/ui";

/**
 * Not-found fallback. Beyond its product purpose, this page is the second
 * route that lets the behavioral analytics suite
 * (tests/analytics/analytics-navigation.spec.ts) exercise a real client-side
 * Next `Link` transition between two different routes.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-gutter py-10 lg:px-gutter-lg lg:py-14">
      <h1 className="font-display text-display-lg">Page not found</h1>
      <p className="max-w-2xl text-body text-content-secondary">
        The page you are looking for does not exist.
      </p>
      <p className="text-body">
        <TextLink href="/">Back to home</TextLink>
      </p>
    </main>
  );
}
