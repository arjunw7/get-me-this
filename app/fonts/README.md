# Vendored typefaces

Both families are loaded locally with `next/font/local` in `app/layout.tsx`. The
application makes no runtime request to `fonts.googleapis.com` or
`fonts.gstatic.com`.

Each file is the official Latin-subset **variable** WOFF2 build, which covers the
weights used by the approved Magic Patterns V18 reference in a single file:

| File                                       | Family              | Axes                                           | SHA-256                                                            |
| ------------------------------------------ | ------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `bricolage-grotesque-latin-variable.woff2` | Bricolage Grotesque | `opsz 12..96`, `wdth 75..100`, `wght 200..800` | `9fee080fcc2d2e0ea8c7ce2a58abaa8ba1f40c6e603643327cd5eb6f07db06a8` |
| `dm-sans-latin-variable.woff2`             | DM Sans             | `opsz 9..40`, `wght 100..1000`                 | `aa530716b0d351866af7dbfa3eee4120fb36f2d071baff8c234185141865c7ff` |

V18 uses Bricolage Grotesque at 500/700/800 and DM Sans at 400/500/600/700; the
variable ranges above cover all of them, so no static instances are needed.

## Sources

Font binaries, downloaded from the official Google Fonts CDN:

- `https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y996as8bTXq_nANBjzKo3IeZx8z6up5L-iNGfyOPPs.woff2`
- `https://fonts.gstatic.com/s/dmsans/v17/rP2Hp2ywxg089UriCZOIHTWEBlw.woff2`

## Licences

Both families are licensed under the SIL Open Font License 1.1. The licence
texts are committed beside the fonts:

- `OFL-BricolageGrotesque.txt` — from `ateliertriay/bricolage` at commit
  `84745e5b96261ae5f8c6c856e262fe78d1d6efdd`
  (SHA-256 `4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba`)
- `OFL-DMSans.txt` — from `google/fonts` `ofl/dmsans/OFL.txt` at commit
  `c26e50af610a8300ad53a2b4955828e329a52d39`
  (SHA-256 `9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1`)

## Verifying

```bash
shasum -a 256 app/fonts/*.woff2 app/fonts/OFL-*.txt
```
