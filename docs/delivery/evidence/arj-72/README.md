# ARJ-72 — Organizer tools pointer

Issue: https://linear.app/arjun-wadhwa/issue/ARJ-72/cursor-pointer-missing-on-organizer-tools-button-hover

- [x] “Hovering over the Organizer tools button on the group page does not change the cursor to a pointer unlike the Invite people button next to it.” The room disclosure now uses the pointer cursor; the browser regression checks computed cursor CSS and opening/closing the real disclosure.
- [x] `pnpm verify` passed on Node 24, including the full unit suite and production build. Two pre-existing unused-variable lint warnings remain.
- Full database, E2E and visual suites run in the PR CI against isolated local Supabase.
- The cursor fix does not change layout or pixels. The existing room interaction test attaches desktop/mobile screen evidence; no visual baselines were changed.
- Railway preview: use the PR deployment check when available; no production resources changed.
- No migration, dependency, mock-data or Magic Patterns editor-artifact changes. Rollback: revert this PR.
