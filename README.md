# Srinath Kishore — Portfolio ("Living Canvas")

Plain HTML/CSS/JS, no build step.

```sh
open index.html            # or: npx serve .
```

## Content still to update
| What | Where |
|---|---|
| Résumé | `assets/resume.pdf` is the old one (predates Amazon, includes phone number). Replace the file; links already point to it. |
| Project details | Placeholders: Chess Analyzer's stack + `.project-proof` line are generic; Agents Circle's (GPT-4o · Claude · Gemini · 3 rounds · Python/FastAPI) are example values. Edit the `.project-proof` lines, the `<ul class="stack">` chips and the `tpl-chess`/`tpl-agents` copy once the projects are built. |
| Project repos | `chess_analyzer` / `agents_circle` on GitHub are empty: push code + a README |
| Amazon role details | `#career` timeline, first stop |
| Site URL | `canonical`, `og:url`, `og:image` in `<head>` assume https://srinathkishore.github.io/ |

Page order: Hero → About → Career → Work → Side quests → Contact. Each section is a one-screen
"scene" of cards (`.scene`); longer content opens in a details sheet (`<dialog id="sheet">`, filled
from `<template id="tpl-…">`, triggered by `data-sheet="…"` buttons).

| Logo | File |
|---|---|
| Amazon | `assets/logos/amazon.png` (Wikimedia's Amazon logo, reversed: white wordmark + orange smile); `amazon-dark.png` is the light-theme version (dark wordmark) |
| Greeno Tech | `assets/logos/greeno.png` (from greenotech.co; white wordmark); `greeno-dark.png` for the light theme |

Both sit on identical chips (`.logo-chip`, 88×34): dark chips with the white logos in the dark theme, light chips with the `-dark` logos in the light theme (`.on-dark` / `.on-light`).
`assets/apple-touch-icon.png` (180×180) is the iOS home-screen icon.
The Agents Circle seats use the ChatGPT/OpenAI, Claude and Gemini marks from Simple Icons (CC0); the marks are trademarks of their owners.

## Live stats (chess.com + LeetCode)
- `.github/workflows/stats.yml` runs `scripts/fetch-stats.mjs` daily (01:17 UTC) and on demand (Actions → "Update stats" → Run workflow).
- The script calls the chess.com public API and LeetCode's GraphQL endpoint and writes `data/stats.json`; it commits only when the numbers change. If one source fails, its previous values are kept.
- The page reads `data/stats.json` (same origin) and swaps it into the snapshot values in the HTML; the tag shows "live" when the data is under 3 days old, otherwise "as of <date>".
- Usernames: `CHESS_USER` / `LEETCODE_USER` at the top of the script. Run locally with `node scripts/fetch-stats.mjs` (Node 18+).
- Needs the repo's Actions to have write access (Settings → Actions → General → Workflow permissions → "Read and write"). GitHub pauses scheduled workflows after 60 days without repo activity; re-enable from the Actions tab if that happens.

## Typography
GitHub's open type system (SIL OFL), self-hosted in `fonts/`, about 127 KB total:
- **Hubot Sans** (display: hero, titles; italic only for the accent), **Mona Sans** (body, labels, UI), **Monaspace Neon** (data only: dates, stats, stack chips, planet labels).
- Sizes come from one fluid modular scale in `styles.css` (`--step--2` … `--step-5`, from utopia.fyi: 16px × 1.2 at 360px up to 18px × 1.25 at 1240px), plus `--step-hero`. Leading and tracking tokens shrink as size grows. Labels never go below 12px and body text never below 16px.
- Width is set with `font-stretch` keywords, not `font-variation-settings`, so the hero particle canvas (`main.js`) can copy it.
- The files are latin subsets with trimmed axis ranges, made with fontTools: `fonttools varLib.instancer` (Hubot wdth 112.5–125 / wght 600–800; italic wdth 112.5 / wght 500–700; Mona wght 300–700; Monaspace wdth 100 / slnt 0 / wght 400–600), then `pyftsubset --flavor=woff2`. Sources: Google Fonts (Hubot, Mona) and the `githubnext/monaspace` v1.400 webfont release.
- The italic is further cut to basic Latin letters, digits and punctuation (15 KB): `pyftsubset hubot-sans-italic.woff2 --text="A–Z a–z 0–9 .,;:!?'\"“”‘’-–—()&" --layout-features='*' --flavor=woff2`. Accented letters in italic text would fall back.

## Libraries (vendored in `vendor/`, no build step)
- **Lenis 1.3.27** (MIT): smooth wheel scrolling plus every programmatic glide (nav links, hero → About snap).
- Scroll reveals, the nav pill and the active section use `IntersectionObserver`; `planet.js` measures the keyframe stops itself.
- One loop: `window.perf.onFrame` (in `main.js`) runs a single `requestAnimationFrame` for everything (Lenis, planet, starfield, particle name, frame watchdog). `perf.pacer()` caps a loop's fps.
- To upgrade Lenis, replace `vendor/lenis.min.js` (from `npm pack lenis`, `dist/` folder).

## The planet journey (`planet.js`)
- One fixed WebGL canvas draws a fictional planet (pure fragment shader, no 3D library).
- Each section has a keyframe in `KEYS`: where the planet sits (`.planet-anchor` boxes in the HTML, the hero horizon, or the corner minimap), which spot faces the camera, and where the sun is. Scroll blends between them.
- Geography lives in `BLOBS` (continent shapes) and `SITES` (Home base beacon, Chess plateau, Agents atoll, Uncharted). Labels are in `LABELS`.
- One keyframe per scene in `KEYS`; the planet glides to each (≈1.1 s, `TAU`) taking the shortest turn (≤180°). The hero planet idles with a slow spin.
- Project cards (`data-site`) turn the planet toward their landmark on hover/focus (`window.planetFocus`).
- Adding a project: add a `.project` card + `tpl-…` sheet, a landmark in `SITES`, and a label in `LABELS`.
- No WebGL, or only software WebGL (`failIfMajorPerformanceCaveat`)? The page falls back to the CSS horizon in the hero.
- The shader compiles in the background (`KHR_parallel_shader_compile`, else at idle time); the canvas fades in once it's ready. A lost WebGL context is rebuilt on restore.
- Rendering: ≤ 60 fps while moving, 30 fps once settled; canvas capped at ~3M pixels (lite: 1M).

## Hidden stuff
- Move the cursor or drag a finger across the name to scatter the particles; click or tap for a burst.
- Konami code (↑↑↓↓←→←→BA): hyperspace (starfield warp + the name flies back in a colour wave).
- Five quick taps/clicks on the hero (scroll flicks don't count): hyperspace too, and the name returns colour-flipped (ink ⇄ accent); repeat to flip back.
- Respects `prefers-reduced-motion` (static name, no animations).

## Performance tiers
- `index.html` adds `.lite` to `<html>` before first paint on weak hardware (≤ 4 CPU cores, ≤ 4 GB device memory, or Data Saver).
- `main.js` watches frame times after the intro. If the slowest quarter of frames runs above ~24 ms (below ~45 fps), it switches to `.lite`; if it's still above ~40 ms on lite, it adds `.ultra`. Both fire `litechange`.
- Lite: no backdrop blur, still aurora, sparser starfield and particle name, WebGL planet at lower resolution and ~30 fps.
- Ultra: plain text name, still starfield and planet (redrawn only on scroll or theme change), no project-visual animations.
- Reduced motion gets the same still rendering. The aurora is three 160 px canvases scaled up, so it costs almost no GPU memory.
- Theme follows the OS setting until the visitor picks one with the toggle.

## Deploy
Any static host: drag the folder into Netlify/Vercel, or push to a GitHub repo and enable Pages.
