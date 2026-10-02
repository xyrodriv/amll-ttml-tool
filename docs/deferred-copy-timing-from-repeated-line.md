# Copy timing between lines — feature spec (NOT BUILT YET)

AJ raised this on 2026-09-19, we designed it together, and he chose to **defer the build**.
This file is the merged design so it can be picked up later without re-deriving anything.

**Reference implementation to port from:** `C:\Users\ajsigma\Desktop\easier ttml tool`
See `src/components/LyricStrip.jsx` (the right-click menu + N-stepper popover) and
`src/store.js` (`copyBeamFrom` ~line 1687, `pasteBeamAt` ~line 1699, `duplicateAsBg` ~line 1722).

---

## The problem

Songs repeat lines verbatim — choruses, hooks, post-choruses. Right now every repeat has to be
synced from scratch even though the timing is often near-identical to the first occurrence. On a
3-minute song with a 4× chorus that's ~30 lines of pure repetition.

Two distinct sub-problems:

1. **Same tempo** — the repeat is at an identical rhythm. Fully automatable.
2. **Tempo drift** — the repeat is sung slightly faster/slower, or starts at an unknown place.
   Needs a human to say *where* it lands.

The design below handles both by giving the user two different entry points over one engine.

---

## Design: one engine, three entry points

### Entry 1 — The clipboard (AJ's idea, ported from the reference project)

Lives in the **Outline panel** on the left (`src/components/Sidebar/OutlinePanel.tsx`), because
that's where you read lyrics as text.

Right-click any line:

```
┌───────────────────────────────────┐
│  Copy timing… ▸                   │  → opens N-stepper popover
│  Paste timing here                │  → disabled when clipboard is empty
│  (later) Duplicate as BG vocals  │
└───────────────────────────────────┘
```

`Copy timing…` sub-popover (mirror the reference):

- `−` / `+` stepper for **N** — how many consecutive lines to capture as a block (a 4-line chorus
  → N=4). Default to the previous N, or 1.
- A **preview box** drawn around the N lines that would be captured.
- A `Copy` button.

The clipboard holds a **block template**, not a single line. This is what makes chorus→chorus work
in two clicks.

### Entry 2 — The bulk push (Nyx's idea, kept)

For when you know the song structure and want fire-and-forget. Right-click a **synced** line:

```
┌──────────────────────────────────────┐
│  Apply timing to all 3 repeats        │  → exact word-count match
│  Skip — use manual clipboard          │
└──────────────────────────────────────┘
```

Repeat groups are found by hashing each line's text (whitespace-normalised, case-insensitive) when
the file loads or on demand. Reports `Filled 3 · Skipped 1 (no match)` in a toast. Single undo step.

### Entry 3 — The playhead anchor (AJ's refinement)

**Both** paste paths anchor the same way:

- Use the **target line's own `startTime`** when the target already has timing.
- Fall back to the **playhead** (`audioEngine.musicCurrentTime * 1000`) when the target is empty.

So the user always controls *where* the timing lands: either by clicking a line that already sits
at the right place, or by scrubbing the playhead there and then pasting. This is what makes
tempo-drifted repeats workable — the user's hand puts it where the actual repeat is.

### Bonus — "Unsynced repeats" sidebar filter

A filter in the Outline panel showing only lines that are repeats of something you've **already
synced**. It empties as you work through it, so you know exactly when you've banked every repeat.

---

## What we agreed to DROP

- **Tier-2 "character remap" matching** (mapping timing by character offset when word counts
  differ). Risk: produces timings that *look* plausible but are subtly wrong, which is worse than
  an obvious gap. **Exact word-count match or skip.**
- **Stretch / rescale mode.** Same reasoning. Off the table for v1.
- **"Duplicate as BG vocals"** — different complexity tier. Add later as a sibling menu item.
- **Fuzzy text matching.** Exact (case-insensitive, whitespace-normalised) only.

---

## Matching rules (for the bulk push)

- Compare the **concatenated word text**, case-insensitive, whitespace-normalised.
  Do NOT use `line.words.length` alone — identical text can be split into words differently.
- Require an **exact word count match**, else skip.
- Skip the source line if it is unsynced (all words `startTime === 0 && endTime === 0`).
- Skip lines with `ignoreSync`.
- Only ever copy from an **earlier** line, never forward.
- **Never overwrite a target that already has timing**, unless the user explicitly picks
  "overwrite all". Silently clobbering good work would be unforgivable.
- Skip words that are pure whitespace — the spacer words injected by `ttmlToAmll`
  (see `src/modules/ttml-processor/index.ts` ~line 121).

## What to copy, per word at index `i`

- `startTime`, `endTime`
- `emptyBeat`
- `ruby[]` **only if source and target already have the same number of syllables.** Otherwise drop
  the ruby rather than write a mismatched one.

Then set `line.startTime` / `line.endTime` from the source and run `normalizeLineTime(line)`
(`src/modules/lyric-editor/utils/normalize-line-time.ts`) as a final consistency pass.

If the target has an `endTimeLink`, clear it — the copied timing supersedes the link.

---

## Undo

Must be a single undoable step. Write through `useSetImmerAtom(lyricLinesAtom)` → routes into
`undoableLyricLinesAtom = withHistory(lyricLinesAtom, 256)` in `src/states/main.ts`. Same pattern
the Split Word dialog (`src/modules/segmentation/components/split-word.tsx`) and the auto-syllable
toggle (`src/components/RibbonBar/auto-syllable.tsx`) already use — copy from those.

---

## Suggested build order

1. **Clipboard first** — smallest, and it implements the paste-at-playhead mechanic that every
   other path needs.
2. **Bulk push** on top — same engine, plus repeat detection.
3. **Sidebar filter** last — pure polish.

## Files that would change

- `src/modules/lyric-editor/utils/lyric-states.ts` — add `findIdenticalEarlierLine(lines, index)`,
  `buildRepeatGroups(lines)`, `extractTimingTemplate(lines, range)`,
  `applyTimingTemplate(lines, range, template, anchorTimeMs)`.
- `src/components/Sidebar/OutlinePanel.tsx` — right-click menu + N-stepper popover + preview box.
  (Check whether `src/components/Menus/lyric-line-menu.tsx` is the better host — it may already be
  wired into the lyric editor's context menu; the Outline panel is what AJ asked for though.)
- `src/states/main.ts` or a new `src/modules/lyric-editor/states/clipboard.ts` — hold the
  `beamClip` block template.
- `locales/en-US/translation.json` + `locales/zh-CN/translation.json` — new keys under
  `ribbonBar` / a new `outlinePanel` section.

---

## DECIDED (2026-09-19)

**1. "Paste timing here" pastes N lines, not 1.** — AJ: *"if its multiple lines then yeah allow
that."* So the paste block size always matches the captured block size. A 1-line capture pastes
1 line; a 4-line capture pastes 4 consecutive lines starting at the target. The N-stepper in the
Outline popover therefore controls **both** how much is captured and how much is written.

**2. "Mark Begin closes previous word" (`autoClosePrevOnMarkBeginAtom`) stays OFF by default.** —
AJ: *"for number 2 no leave that off."* No change needed; the shipped default is already `false`.
Do not flip it when building this feature.

### Behaviour consequences of decision 1

- The paste must still honour the hard rule: **never overwrite a target that already has timing.**
  With N-line paste this is more likely to bite — e.g. capturing 4 lines and pasting onto a block
  where line 3 is already synced. Skipped lines get collected and reported in the result toast
  ("applied 2 of 4 · 2 skipped, already timed"), not silently replaced.
- The paste needs a bounds check: if fewer than N lines remain below the target, paste what fits
  and report the shortfall rather than throwing.
- Undo remains a single history entry covering the whole N-line write (see
  `useSetImmerAtom(lyricLinesAtom)` → `undoableLyricLinesAtom`).
