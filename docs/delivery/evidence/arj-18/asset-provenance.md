# ARJ-18 asset provenance and rights conclusion

The 003b auth and onboarding screens introduce **no new binary assets**.

- `AuthCollage` (rendered on every auth screen) reuses the two ARJ-16
  vendored images `public/assets/landing/a-matcha.jpg` and
  `public/assets/landing/z-camera.jpg`, plus the zoya initials avatar
  (initials-based, no file).
- The inbox preview, OTP, confirm, and onboarding screens are pure markup
  and inline SVG (Lucide ISC, vendored in `src/landing/icons.tsx` with
  documented provenance).
- No remote CDN image is referenced at runtime.

## Rights status

The seven shared images carry completed positive rights conclusions,
owner-approved 2026-09-27 at their recorded hashes
(`docs/delivery/evidence/arj-16/asset-provenance.md`, Magic Patterns user
content ownership under the recorded Terms). This slice uses only those
assets; nothing with an unresolved conclusion is shipped, and there is no
interim acceptance path.

## Reference captures (not production assets)

`reference-captures/` contains six PNGs rendered from the frozen Magic
Patterns artifact (`a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b`, v18) through a
disposable Vite harness in `/tmp/v18-harness` (outside the repository and
the production dependency graph; the harness is not committed). Their
SHA-256 hashes are recorded in `reference-captures/SHA256SUMS`. They are
design-reference evidence for the three states without a distinct frozen
screenshot and are never served by the application.
