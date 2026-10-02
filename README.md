<div align=center>

<img src="./public/logo.svg" align="center" width="256">

# Apple Music-like Lyrics TTML Tool

A brand-new word-by-word lyrics editor, built for the
[Apple Music-like Lyrics ecosystem](https://github.com/amll-dev/applemusic-like-lyrics).

<img width="1312" alt="image" src="https://github.com/user-attachments/assets/4db81b29-df0c-4f6e-819a-3b956b28247c">
<img width="1312" alt="image" src="https://github.com/user-attachments/assets/929eefee-ebda-43db-ad04-c0f099077053">
<img width="1312" alt="image" src="https://github.com/user-attachments/assets/7c80902e-45a9-42ae-b980-f5500069acb8">

</div>

## About this fork

This is a customized fork maintained at
**[github.com/xyrodriv/amll-ttml-tool](https://github.com/xyrodriv/amll-ttml-tool)**,
forked from [github.com/amll-dev/amll-ttml-tool](https://github.com/amll-dev/amll-ttml-tool)
(the original upstream project, © Steve Xiao and the AMLL contributors).

The live web build is at **[amll-ttml-tool-clone.vercel.app](https://amll-ttml-tool-clone.vercel.app)**
and redeploys automatically on every push to this fork's `main` branch.

### Credits & licenses

- Upstream editor: [`amll-dev/amll-ttml-tool`](https://github.com/amll-dev/amll-ttml-tool) — **GPLv3**
- Spicy Lyrics preview renderer: derived from [`spicy-lyrics`](https://github.com/Spikerko/spicy-lyrics)
  (and the NaeNae React rewrite of it) — **AGPLv3**; the combined work inherits AGPLv3 per §13
- `@kawarp/core` (Apple-Music-style fluid backdrop) — **MIT**
- The modified source of this fork is published at the link above, as required by AGPLv3 §13

## Usage

> [!WARNING]
> This tool is not intended for phones or other small-screen devices — the workflow is cumbersome on them.

Use the hosted build of this fork at
**[amll-ttml-tool-clone.vercel.app](https://amll-ttml-tool-clone.vercel.app)**.

The upstream project also hosts its own online version at
[`https://amll-ttml-tool.stevexmh.net/`](https://amll-ttml-tool.stevexmh.net/), and a bleeding-edge
build on its [test branch](https://amll-ttml-tool-test.vercel.app/).

A Tauri desktop build is available through the upstream repository's
[GitHub Actions workflow](https://github.com/amll-dev/amll-ttml-tool/actions/workflows/build-desktop.yaml).

## Editor features

- Basic input, editing and timing (syncing) tools
- Read and save lyrics in TTML format
- Configure per-line behavior (background vocals, duet lines, etc.)
- Configure lyric file metadata (title, artist, Netease Cloud Music ID, etc.)
- Split / merge / move words
- Import (and partially export) LRC, ESLyric, YRC, QRC and Lyricify Syllable formats
- Import plain-text lyrics that use special markers
- Configurable keyboard shortcuts

## Development & build

Building this project is somewhat involved. If the prose below is hard to follow, just mirror the steps
in the [`build-desktop.yaml`](.github/workflows/build-desktop.yaml) workflow.

This project only supports **PNPM** — make sure you have it installed.

Clone the repository, then run the build inside the project folder:

```bash
pnpm i           # install dependencies
pnpm dev         # start the dev server
pnpm build       # build the web version
pnpm tauri dev   # start the Tauri desktop dev environment
pnpm tauri build # build the Tauri desktop version
```

## Contributing

Code and translation contributions are welcome, as are issues and suggestions.

To add a new language translation, see [`./src/i18n/index.ts`](./src/i18n/index.ts) and
[`./locales/zh-CN/translation.json`](./locales/zh-CN/translation.json).
