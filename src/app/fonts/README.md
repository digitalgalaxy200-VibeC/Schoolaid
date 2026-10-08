# Local font files

The two font families this app uses, vendored here so the build never asks
Google Fonts. Referenced by `src/app/layout.tsx` (Inter) and `src/app/page.tsx`
(Plus Jakarta Sans) via `next/font/local`.

## Why these are local

`next/font/google` fetches font CSS from Google at build time, and Google
sometimes answers with extensionless `/l/font?kit=…` URLs (~1–2% of responses).
Both bundlers crash parsing that shape — Turbopack with
`next/font/google queries have exactly one entry`. It is an open Next.js bug
([vercel/next.js#99114](https://github.com/vercel/next.js/issues/99114)), it hit
a Vercel build of this repository, and redeploying does not reliably clear it
(one reporter saw five consecutive failures in a 20-minute window).

A local font removes the variable entirely: the build reads these files from
the repository and never depends on a network response shape.

## The files

| File | Family | Subset | Weight range |
|---|---|---|---|
| `inter-latin.woff2` | Inter | latin | 400–700 |
| `plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans | latin | 400–800 |

Both are VARIABLE fonts — one file covers every weight the app uses, which is
why each `localFont` call declares `weight: "400 700"` (or `"400 800"`) rather
than a list of separate files.

Downloaded from `fonts.gstatic.com` (via the `fonts.googleapis.com/css2` API,
latin subset, Chrome user-agent) on **2026-10-08**. Both families are licensed
under the [SIL Open Font License 1.1](https://openfontlicense.org), which
permits redistribution.

To re-download or add a weight beyond these ranges, fetch the family's CSS with
a Chrome user-agent, take the `/* latin */` `@font-face` block's `src: url(…)`,
and save the bytes as a `.woff2` here.
