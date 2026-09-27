export const referenceRoute = {
  eyebrow: "Foundation reference",
  title: "Get Me This is ready for the next slice.",
  description:
    "This deterministic route verifies the application shell, command surface, and production build without product data or external services.",
  guarantees: [
    "No network data or private environment variables",
    "No clock time or randomness",
    "Ready for the next approved foundation issue",
  ],
} as const;
