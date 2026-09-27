# V18 reference capture notes

- Artifact ID: `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b` (pinned Magic Patterns artifact)
- Version label: `v18`
- Capture date: 2026-09-27
- Source (frozen, byte-identical copy): `/home/factory-user/get-me-this/docs/design-reference/magic-patterns-v18/source/`
- Harness: disposable Vite dev harness, per the capture contract in `docs/design-reference/baselines/v18/README.md`
  (the harness lives at `/tmp/v18-harness`; see Deviations below for the path change)

## Capture contract

- Viewports: 390x844 (mobile) and 1440x1000 (desktop).
- Browser: headless Chromium (Playwright bundled `chromium-1243`, @playwright/test 1.63 from the repo install), device scale factor 1.
- Reduced motion: enabled (`reducedMotion: 'reduce'` context option; source CSS also collapses animation durations under `prefers-reduced-motion: reduce`).
- Fonts awaited: `document.fonts.ready` awaited before every screenshot; all font weights actually used by the rendered states report `loaded` (Bricolage Grotesque 700/800, DM Sans 400/600/700). Google Fonts loaded successfully over the network.
- CDN imagery: the 2 `cdn.magicpatterns.com` images on the confirm page loaded successfully (`complete && naturalWidth > 0` verified); screenshot capture additionally waited for all in-flight `<img>` loads.
- Screenshots: full-page PNG.

## States, URLs, and capture procedure

1. `confirm-valid-final` — `http://127.0.0.1:5199/auth/confirm` with default `signInLinkState='valid'`. ConfirmLink starts in `loading`; its 1200 ms timeout sets `success`. Captured after an auto-retrying assert that the page heading contains "You're in." (the source text uses the curly apostrophe U+2019), then fonts re-await and immediate full-page screenshot. Verified at screenshot time the lime (`bg-lime`) check-circle (`svg.lucide-check`) is present and the page had not yet fired its 1000 ms post-success navigation.
2. `confirm-expired-final` — `http://127.0.0.1:5199/auth/confirm?state=expired`. The component reads `params.get('state')` and falls back to `linkVariant`, so the query param deterministically selects the `expired` variant without touching source. Captured after asserting the heading "This link has expired." Verified the marigold broken-link circle (`bg-marigold-soft` + `svg.lucide-link2-off`) and the visible "Send a new email" button.
3. `onboarding-validation` — `http://127.0.0.1:5199/onboarding`. Name input prefilled with `nameFromEmail('arjun@example.com')` = "Arjun". Procedure: fill the name input with '', click the "Let's go" submit button (curly apostrophe), which sets `touched` and shows the validation state. Captured after asserting the exact error copy "Friends need something to call you." is visible. Verified the error span carries `text-coral-deep` (coral) and the input has `aria-invalid="true"` with the `border-coral-deep` class.

Note: this model could not visually inspect the PNG files (no image input support), so the state sanity check was done deterministically against the rendered DOM at capture time using the same viewport/motion settings; the exact assertions and results are listed above. All assertions passed for all three states at both viewports.

## Files and SHA-256

| File | SHA-256 | Dimensions |
| --- | --- | --- |
| confirm-valid-final--mobile-390x844.png | 41c1c63e7b5c67cf619f906518bc5f5cbf5f518bc65711fcd56d10bd02391e41 | 390x844 |
| confirm-valid-final--desktop-1440x1000.png | 02fe2ccba4b0b32834cf9aebbab9e6aa20bfc9659c673b41ec59bbbcbdd0c438 | 1440x1000 |
| confirm-expired-final--mobile-390x844.png | f082fad6d6c42af0746b58ae630de78bb3dfad11126aca6dda11838b6e937496 | 390x844 |
| confirm-expired-final--desktop-1440x1000.png | b1f5ce812c19809cab7cb1c59f06a119c8debc597f368a433f0df3a93bcfb1c9 | 1440x1000 |
| onboarding-validation--mobile-390x844.png | a6b247a1fdce319e75fdda2b7c9aa5428aa23c053527969928fb300dc2ce0df2 | 390x1036 (full page exceeds viewport) |
| onboarding-validation--desktop-1440x1000.png | b40e9920e3da84e5b7e345a3bfad0b4ececab376f86e712f3480f9cca7981ca3 | 1440x1048 (full page exceeds viewport) |

Full hashes:

```
41c1c63e7b5c67cf619f906518bc5f5cbf5f518bc65711fcd56d10bd02391e41  confirm-valid-final--mobile-390x844.png
02fe2ccba4b0b32834cf9aebbab9e6aa20bfc9659c673b41ec59bbbcbdd0c438  confirm-valid-final--desktop-1440x1000.png
f082fad6d6c42af0746b58ae630de78bb3dfad11126aca6dda11838b6e937496  confirm-expired-final--mobile-390x844.png
b1f5ce812c19809cab7cb1c59f06a119c8debc597f368a433f0df3a93bcfb1c9  confirm-expired-final--desktop-1440x1000.png
a6b247a1fdce319e75fdda2b7c9aa5428aa23c053527969928fb300dc2ce0df2  onboarding-validation--mobile-390x844.png
b40e9920e3da84e5b7e345a3bfad0b4ececab376f86e712f3480f9cca7981ca3  onboarding-validation--desktop-1440x1000.png
```

## Harness deviations from source bytes

No file inside `/home/factory-user/get-me-this` was modified. The full source tree was copied byte-identically into the harness (verified by hash). Harness-only changes:

1. `package.json` was replaced by a harness variant: identical runtime dependencies (react 18.3.1, react-dom 18.3.1, react-router-dom 6.30.2, lucide-react 0.577.0, framer-motion 11.18.2, @radix-ui/react-icons 1.3.2, date-fns 4.1.0, tailwind-merge 2.6.1, sonner 1.7.4) plus devDependencies vite 5.4.21, @vitejs/plugin-react, tailwindcss ~3.4.17, postcss, autoprefixer.
2. Added Vite scaffolding absent from the source: `index.html` (loads `/index.tsx`), `vite.config.mjs` (react plugin, 127.0.0.1:5199), `postcss.config.cjs` (tailwindcss + autoprefixer for the source's Tailwind v3 `@import 'tailwindcss/*'` syntax and unmodified `tailwind.config.js`).
3. Source `index.tsx`, `App.tsx`, and all components/pages/contexts/data/utils/types are untouched; `index.tsx` served as the Vite entry unmodified. The `?state=expired` variant was selected purely via URL query, not a source change.
4. Location deviation: the specified `/private/tmp` does not exist on this machine and the root filesystem is not writable by the runtime user, so the harness was built at `/tmp/v18-harness` instead. It was left in place.
5. Playwright was not installed in the harness; the script reused the repo's `@playwright/test` 1.63 install at `/home/factory-user/get-me-this/node_modules` (read-only) with its bundled Chromium.

## Environment

- Dev server: Vite 5.4.21 on `http://127.0.0.1:5199`, stopped after capture.
- Node v24.21.0, pnpm 12.6.0.
- Google Fonts and cdn.magicpatterns.com both loaded successfully; no assets failed.
