# Plan: port the Spicy Lyrics renderer into the Preview tab

**Status:** awaiting sign-off — nothing built yet.
**Approach:** Option B (core-only port). Same animation math, same CSS classes, same font.
**Decision date:** 2026-09-19

---

## 1. Why this is feasible

The Spicy Lyrics render path has **zero Spicetify dependencies**. Verified by grep:

| File | `Spicetify.` count |
|---|---|
| `Applyer/Synced/Syllable.ts` | 0 |
| `Applyer/Synced/Line.ts` | 0 |
| `Applyer/Static.ts` | 0 |
| `Animator/Shared.ts` | 0 |
| `ttml/parser.ts` | 0 |
| `LyricsVirtualizer.ts` | 0 |
| `lyrics.ts` | 0 |
| `CreateLyricsContainer.ts` | 0 |
| `Scrolling/Simplebar/ScrollSimplebar.ts` | 0 |
| `CSS/Styles.ts`, `Logger.ts`, `Maid.ts`, `Spring.ts` | 0 |

All 164 Spicetify calls live in the fetch / player / page-chrome / settings layer, which we skip.

The renderer's contract is small:

- `ApplySyllableLyrics(data, useRomanized)` — builds DOM from a plain `LyricsData` object.
- `Animate(positionMs)` — the per-frame driver. Takes a position in **milliseconds**, writes CSS custom properties (`--gradient-position`, `--BlurAmount`, `--text-shadow-blur-radius`, `--scale-amount`, …) and toggles `Active` / `NotSung` / `Sung` classes. This is the entire animation.

So integration is: **build data → apply once → call `Animate()` every frame.**

---

## 2. Files to copy (verbatim, from `spicy-lyrics-6.3.20`)

Target: `src/modules/spicy-preview/vendor/` — kept in a `vendor/` subdir so upstream provenance stays obvious and future diffs are easy.

### Renderer core (~3,000 lines)
```
src/utils/Lyrics/Applyer/Synced/Syllable.ts    571
src/utils/Lyrics/Applyer/Synced/Line.ts        340
src/utils/Lyrics/Applyer/Static.ts             147
src/utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts  1840
src/utils/Lyrics/Animator/Lyrics/LyricsSetter.ts    147
src/utils/Lyrics/Animator/Shared.ts              32
src/utils/Lyrics/ttml/parser.ts                1178   (zero imports — fully self-contained)
```

### Support (~1,500 lines)
```
src/utils/Lyrics/lyrics.ts                     344   (LyricsObject state + LyricsSetter deps)
src/utils/Lyrics/LyricsVirtualizer.ts         1006   (see note — may be stubbed)
src/utils/Lyrics/Applyer/CreateLyricsContainer.ts  86
src/utils/Lyrics/Applyer/Utils/Emphasize.ts       115
src/utils/Lyrics/Applyer/Utils/IsLetterCapable.ts  38
src/utils/Lyrics/Applyer/Utils/PickDisplayText.ts  21
src/utils/Lyrics/Applyer/Utils/StripZeroWidth.ts   19
src/utils/Lyrics/Applyer/OnApply.ts               18
src/utils/Lyrics/ConvertTime.ts                    3
src/utils/Lyrics/EmptyLines.ts                    75
src/utils/Lyrics/isRtl.ts                         31
src/utils/CSS/Styles.ts                           23
src/utils/Scrolling/Simplebar/ScrollSimplebar.ts  73
src/modules/Spring.ts                            122
src/modules/Maid.ts                               96
src/utils/Logger.ts                               59
```

**Note on `LyricsVirtualizer.ts` (1006 lines):** it virtualizes long lyric lists via
`@tanstack/virtual-core`. For a preview over a song file this is unnecessary complexity.
Recommended: **stub it** (render all lines) in step 3. Revisit only if preview perf is bad on
very long tracks.

---

## 3. Modules to stub (do NOT copy)

These are the Spicetify-coupled leaves. Replace with ~150 lines total of local shims in
`src/modules/spicy-preview/shims/`.

| Upstream | Why | Shim |
|---|---|---|
| `components/Pages/PageView.ts` (800 lines) | Real one builds Spotify page chrome + Tippy tooltips | Export a mutable `PageContainer` pointing at our own `<div>` |
| `utils/stores.ts` (110 lines) | Uses `Spicetify.LocalStorage` for persistence | Same nanostores atoms, backed by `localStorage` |
| `Credits/ApplyIsByCommunity.tsx` (4 Spicetify calls) | Fetches contributor credits from the network | No-op |
| `Credits/ApplyLyricsCredits.ts`, `Credits/ApplyProvider.ts` | Provider badges | No-op |
| `fetchLyrics.ts` (500 lines) | Whole network layer; we only need `ClearLyricsPageContainer` | Export a local `ClearLyricsPageContainer` |
| `Scrolling/Simplebar/*` + `ScrollToActiveLine.ts` | Spotify scroll machinery | Minimal: native scroll + no-op force-scroll |
| `LyricsVirtualizer.ts` | see above | No-op `initLyricsVirtualizer` / `destroyLyricsVirtualizer` |

---

## 4. Data pipeline

```
lyricLinesAtom  (editor state)
   → amllToTTML(...)          [already exists: src/modules/ttml-processor/index.ts:277]
   → TTML string
   → ParseTTML(...)           [copied: ttml/parser.ts]
   → LyricsData  ({ Type:"Syllable", Content:[{Lead:{Syllables:[…]}}] })
   → ApplySyllableLyrics(data, false)
```

Using the upstream `parser.ts` (rather than hand-converting AMLL → Spicy format) means the
preview consumes **exactly** what the extension consumes. That is the point of the exercise.

Recompute on every `lyricLinesAtom` change (debounced ~150 ms so typing doesn't thrash), then
re-apply.

---

## 5. CSS and fonts

### CSS to copy
```
src/css/tokens.css                 ~6 KB   (base custom properties)
src/css/primitives.css             ~8.5 KB
src/css/Lyrics/main.css            ~4.6 KB (defines --DefaultLyricsSize)
src/css/Lyrics/Mixed.css          ~29 KB   (the actual lyric look; uses 1cqw, cq units)
+ a trimmed subset of src/css/ContentBox.css (53 KB) for
  .ContentBox / .LyricsContainer / .LyricsContent / .SpicyLyricsScrollContainer
```

**Gotcha:** `Mixed.css` uses container-query units (`1cqw`). The preview container must set
`container-type: inline-size`, or every size collapses to 0.

### Fonts (from the Aurora source — the official repo does not bundle them)
```
spicy-ytm/src/extensions/fonts/LyricsRegular.woff2    (400)
spicy-ytm/src/extensions/fonts/LyricsMedium.woff2     (500)
spicy-ytm/src/extensions/fonts/LyricsSemibold.woff2   (600)
spicy-ytm/src/extensions/fonts/LyricsBold.woff2       (700)
```
Copy to `src/modules/spicy-preview/assets/fonts/` and adapt
`spicy-ytm/src/extensions/fonts/spicy-lyrics.css` (4 `@font-face` blocks, family
`"SpicyLyrics"`) with corrected relative URLs.

Keep `SPICY_LYRICS_FONT_LICENSE.txt` alongside and mirror the attribution comment.

---

## 6. Dependencies to add

```
nanostores                 (state atoms the animator reads)
cubic-spline               (spline interpolation in the animator)
d3-ease                    (easeSinOut)
@tanstack/virtual-core     (only if we keep the real virtualizer — skip if stubbed)
```

Install with pnpm. **Reminder:** dependency installs in the sandboxed agent shell take ~1 hour;
AJ should run `pnpm install` in a normal terminal and report back.

---

## 7. Integration point in this app

- New component `src/modules/spicy-preview/SpicyPreview.tsx`: a `<div>` container + rAF loop.
- Drive with `audioEngine.musicCurrentTime * 1000` each frame — mirror how
  `src/components/AMLLWrapper/index.tsx` already uses `audioEngine.onTimeUpdate` / `musicCurrentTime`.
- Render into the Preview tab at `src/App.tsx:373`, alongside (or instead of) `<AMLLWrapper />`.
- Add a `previewRendererAtom` (`"amll" | "spicy"`) and a segmented control in
  `src/components/RibbonBar/preview-mode.tsx`.

---

## 8. Build order

1. **Scaffold + shims.** `vendor/` skeleton, `shims/` for PageContainer / stores / credits / fetchLyrics / simplebar / virtualizer. Prove the copied modules *compile* (`tsc --noEmit`) with zero behaviour.
2. **Static render.** Wire `amllToTTML → ParseTTML → ApplySyllableLyrics`. No animation. Confirm lines and syllables appear with correct classes and the SpicyLyrics font loads.
3. **Fonts + CSS.** Add woff2 + `@font-face`, copy the CSS set, set `container-type: inline-size`. Confirm it *looks* like Spicy Lyrics at a static position.
4. **Animation.** rAF loop calling `Animate(audioEngine.musicCurrentTime * 1000)`. Confirm gradient sweep, scale springs, blur, glow.
5. **Toggle + polish.** `previewRendererAtom`, ribbon control, handle empty lyrics / no audio, verify 60 fps.

Each step is independently verifiable. Stop after any step if fidelity is wrong.

---

## 9. Risks and unknowns

- **Settings-derived CSS vars.** `--SpicyLyrics-LineSpacing`, `--DefaultLyricsSize`, `--DefaultLineScale`, `--Vocal-*-opacity` are normally written by the settings layer we're not porting. Step 3 must set sane defaults or lyrics may render at wrong size/opacity.
- **Scroll behaviour.** With the virtualizer and simplebar stubbed, auto-scroll-to-active-line won't exist initially. Acceptable for preview; note it rather than silently shipping half a feature.
- **Duplicate CSS var names.** Spicy CSS uses generic names (`--gradient-color`, `--top`, `--bottom`). Must be scoped under the preview container to avoid leaking into the rest of the app.
- **Bundle size.** ~4,500 lines of TS + ~48 KB CSS added to the Preview tab. It's lazy-loaded already (`lazy(() => import(...))`), so Edit/Sync payload is unaffected.
- **Upstream drift.** This is a snapshot of 6.3.20. Future upstream changes won't flow in automatically.

---

## 10. License

- `spicy-lyrics` is **AGPLv3**; AMLL TTML Tool is **GPLv3**. GPLv3 §13 permits combining, but the combined work then carries AGPLv3. Irrelevant for a purely local tool; it matters only if this fork is ever distributed or served over a network.
- Fonts require attribution (see `SPICY_LYRICS_FONT_LICENSE.txt`). Upstream redistribution terms are not stated — keep the attribution file with the woff2 files.
- AJ has confirmed he's fine modifying/reusing both.

---

## 11. Decisions (answered 2026-09-19)

1. **Toggle, not replace.** `previewRendererAtom` (`"amll" | "spicy"`, default `"amll"`) in
   `src/modules/settings/states/preview.ts`; a `Select` in the Preview ribbon; `App.tsx` switches
   between `<AMLLWrapper />` and `<SpicyPreview />`. AMLL stays as the fallback.
2. **No static lyrics.** `Applyer/Static.ts` is NOT ported. Only `Syllable` and `Line` types render;
   anything else leaves the panel empty.

## 12. Build status

| Step | State |
|---|---|
| 1. Scaffold + shims | **Done** — vendor compiles clean, `tsc --noEmit` passes |
| 2. Static render | **Done + verified** — jsdom smoke test: 2 lines, 15 letter nodes in DOM |
| 3. Fonts + CSS | **Done** — fonts + 5 CSS files copied; on-screen layout still needs AJ to eyeball |
| 4. Animation | **Done + verified** — `Animate(1000)` sets `.Active` and `--BlurAmount: 0px` |
| 5. Toggle + polish | **Done** — atom, ribbon Select, i18n, auto-scroll to active line |

**Verified headlessly** with a jsdom harness (temp files since deleted): `parseTTML` →
`ApplySyllableLyrics` → 2 `.line` elements mounted with correct text, `Animate()` assigning
`Active`/`--BlurAmount`. Still needs an on-screen check for sizing, spacing and font.

### Why it rendered blank at first (fixed 2026-09-19)

Four independent gaps, each sufficient on its own to produce an empty panel:

1. **Missing `SpicyRenderer` class.** 178 of 880 rules in `Lyrics/Mixed.css` are gated on
   `#SpicyLyricsPage.SpicyRenderer`. Upstream adds it in `PageView.ts:146`. Without it the entire
   lyric stylesheet is inert.
2. **The virtualizer stub was a no-op.** `Synced/Syllable.ts` and `Line.ts` only ever
   `createElement` — they never `appendChild`. Mounting is 100% the virtualizer's job
   (upstream `LyricsVirtualizer.ts:543` / `:640`). A no-op stub means every line is built and
   then dropped: nothing is ever in the DOM.
3. **`$currentLyricsType` was never set.** Upstream sets it in `fetchLyrics.ts:45`, which is a stub
   here. `Animate()` returns on line 1 without it, so lines never receive `Active`/`NotSung`/`Sung`
   — and those classes are what supply the gradient/`text-shadow` that makes
   `-webkit-text-fill-color: transparent` glyphs visible at all.
4. **`.VirtualLyricsContainer` is `container-type: size`.** Size containment means its height does
   not grow with content, and upstream writes the height from JS. Left alone it is 0 px tall.

Fixes: `SpicyRenderer UseSpicyFont` on the root; a real (non-virtualizing) `initLyricsVirtualizer`
that appends lines and sets `container-type: inline-size` + `height: auto`; `$currentLyricsType`
set from the parsed type; a fallback fill colour scoped to
`.line:not(.Active):not(.NotSung):not(.Sung)` so the first frame is never invisible.

### Deviations from the plan

- **No `pnpm add`.** corepack/pnpm is broken in the sandbox (`Cannot find module .../corepack/dist/pnpm.js`).
  `cubic-spline`, `fast-xml-parser`, `d3-ease`, `strnum`, `@types/d3-ease` were fetched as registry
  tarballs and extracted straight into `node_modules`. **`package.json` and `pnpm-lock.yaml` were NOT
  updated** — AJ must run `pnpm install` (or add them manually) so the lockfile matches.
- **nanostores not installed.** `vendor/utils/stores.ts` is a hand-written 60-line atom with the same
  `.get()` / `.set()` / `.subscribe()` surface.
- **simplebar not installed.** `ScrollSimplebar.ts` is a stub that fabricates a `.simplebar-content`
  element and uses native scrolling.
- **virtualizer stubbed** as planned (1006 upstream lines skipped) — but it still **must mount the
  lines**. A no-op is not an acceptable stub; see "Why it rendered blank at first".
- **`ApplyIsByCommunity.tsx` renamed to `.ts`.** The shim contains no JSX; `.tsx` was only kept to
  match upstream's import specifier, which the Node smoke-test loader could not parse.
- **auto-scroll reimplemented.** Upstream drives `ScrollToActiveLine` from an `IntervalManager` in
  `app.tsx`; the preview calls it from the rAF loop throttled to 120 ms, centring the `.line.Active`
  via `getBoundingClientRect()`. No Spring easing, no drag suppression beyond `isDragging`.
- **`ContentBox.css` copied whole** (53 KB) rather than trimmed. Its layout rules are scoped to
  `#SpicyLyricsPage`, so the preview root carries that id.
- **`:root` → `.spicy-preview-root`** rewritten across all copied CSS to stop generic custom
  properties (`--top`, `--bottom`, `--gradient-color`) leaking into the rest of the app.
- **7 `// @ts-ignore` added** to vendored files where upstream keeps intentionally-dead declarations
  (upstream suppresses these with eslint, which TypeScript does not honour under `noUnusedLocals`).
- **2 null-safety fixes** in vendor code (`ttml.tt?.body?.[...]`, `Syllables!.Lead`) — upstream
  compiles with looser strictness than this project.
