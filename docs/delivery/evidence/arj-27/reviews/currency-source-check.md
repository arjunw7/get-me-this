# ARJ-27 independent currency-source verification

Controller verification, not replacement for code, image or CI review.

At 2026-09-30T18:26:13.059Z the controller fetched [SIX ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml) over HTTPS successfully (HTTP 200). The XML declares publication date 2026-09-17. Its exact UTF-8 SHA-256 is `33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff`.

The initial parse selected every currency entry whose minor-unit precision was neither 2 nor N.A., deduplicated by code. It found 26 entries. A second fetch compared the committed `CURRENCY_MINOR_DIGITS` table in `src/wishlist/display.ts` with the parsed zero-, three-, and four-digit entries. Both contain 26 entries; mismatches are empty. The code was unchanged from implementation commit `626aba6`.

```json
{"published":"2026-09-17","localCount":26,"remoteCount":26,"mismatches":[]}
```

This closes the controller's source-retrieval check that the independent code reviewer could not complete because its network environment rejected the XML. The reviewer's historical report remains unchanged and accurately records its limitation. This check makes no claim about DB transport or rendered prices; those still require the configured CI tests. No source, schema, provider configuration, or baseline was changed by this check.
