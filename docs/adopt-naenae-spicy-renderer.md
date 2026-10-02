# 采用 NaeNae fork 的 Spicy Lyrics 渲染器

来源：https://github.com/NaeNaeTart/NaeNae-AMLL-TTML-TOOL
（AMLL TTML Tool 的一个 fork，README 里明确列了 "Spicy Lyrics Preview" 特性）

## 为什么要换

当前 `src/modules/spicy-preview/` 是**逐字照搬上游 Spicy 的 DOM 操作实现**，
它有几个结构性缺陷，正好对应 AJ 反馈的四条问题：

| AJ 的反馈 | 现方案的根因 |
|---|---|
| "fill left to right is laggy" | 直接读 `audioEngine.musicCurrentTime`。音频元素的 `currentTime` 只在粗粒度间隔更新，不插值就必然顿挫 |
| "0 animations, no glow" | 上游靠大量 `style.setProperty` 驱动，没有弹簧插值，帧间是硬跳变 |
| "doubled / 一行叠一行" | 手工 `createElement` + `appendChild` 的移植，DOM 生命周期容易出重影 |
| "no syllabled" | 逐字强调的门槛是 `duration >= 1000ms`（上游如此），短词本来就没有逐字效果 |

NaeNae 的 `src/components/SpicyLyrics/` 是**同一套渲染逻辑的 React 重写**，
不是照搬 DOM 操作：

- `interpolatedCurrentTime`：用 `performance.now()` 在 `currentTime` 两次上报之间外推，
  这是「顺滑」的关键（现方案缺的就是这个）
- `Spring` 物理插值（scale / y / glow / opacity），帧间是平滑过渡而非硬跳
- 用 React ref 直接持有 line / word 节点，没有 `querySelector` 和全局可变状态
- 直接从 `LyricLine[]` 建模（`model.ts`），**不做 TTML 往返**，少一层解析失败风险
- 完整支持 dot line（间奏点）、和声行、对唱、RTL、罗马音、翻译行
- 自带 `model.test.ts`

体积：index.tsx 1016 行 + css 442 + math 122 + model 281 ≈ 2100 行，比现在的
vendor 目录（`parser.ts` 就 1178 行 + 20 多个 shim）更好维护。

## 现成 vs 需要补

**已有（无需改动）**
- `classnames`（package.json 已有）
- `showTranslationLinesAtom` / `showRomanLinesAtom`
- `lyricLinesAtom`、`audioEngine.musicPlaying` / `musicCurrentTime` / `seekMusic`
- 字体：两边字节数完全一致（Bold 98692 / Medium 99776 / Regular 89448 / Semibold 100176），
  就是同一批 woff2，不用重新拷

**需要补**
1. `LyricLine` 加 `isLineSynced?: boolean`（NaeNae 的 types 里是可选字段）
2. `audioEngine` 加 `interpolatedCurrentTime` getter（照抄他们的实现，20 行）
3. `src/modules/settings/states/preview.ts` 补 5 个 atom：
   `showFpsCounterAtom`、`spicyBackgroundModeAtom`、`spicyForceLineSyncedAtom`、
   `spicySimpleLyricsModeAtom`、`spicyBackgroundImageAtom`
4. 补 `currentTimeAtom`（seek 用）、`audioCoverArtAtom`
5. 补/简化 `customAccentColorAtom` + `useCustomAccentAtom`
6. `@kawarp/core` —— **未安装**。他们用它做 WebGL 动态封面背景

## 需要拍板的两件事

### 1. 动态封面背景（@kawarp/core）

他们有三种背景模式：`animated`（kawarp WebGL）、`color`（封面取色渐变）、`static`（封面模糊）。

- **A. 不装 kawarp，只保留 color / static**（推荐）—— 少一个 WebGL 依赖，
  背景依然好看（封面取色 + 渐变）。后续想加再单独装。
- B. 装 `@kawarp/core` —— 完整复刻，但多一个重依赖，且 Tauri webview 里 WebGL 有风险。

### 2. 现有 `src/modules/spicy-preview/` 怎么办

- **A. 整个删掉**（推荐）—— 两个渲染器留着没意义，vendor 目录 20 多个 shim 全是负担。
- B. 保留作为 toggle 的第二个选项 —— 多一份维护成本，且它本身就是被替换掉的次品。

## 决定（2026-09-19）

1. **装 `@kawarp/core`** —— 保留完整动态封面背景
2. **旧 port 整个移除** —— 已挪到 `.backup/spicy-preview-2026-09-19/`（备份，不在 `src` 下，不参与构建）
3. **全部设置都接到 Ribbon** —— FPS / Simple Lyrics / 强制整行同步 / 背景模式

## 已完成

- [x] 拷 `math.ts` / `model.ts` / `index.tsx` / `index.module.css` 到 `src/components/SpicyLyrics/`
      （`model.test.ts` 没拷 —— 本项目没有 vitest，留着会报 `Cannot find module 'vitest'`）
- [x] 字体放到 `src/assets/fonts/spicy-lyrics/`（和上游 CSS 的 `../../assets/fonts/...` 路径对齐）
- [x] `LyricLine` 加 `isLineSynced?: boolean`
- [x] `audioEngine` 加 `interpolatedCurrentTime`（**顺滑扫光的关键**）和 `analyserNode`（动态背景取能量）
- [x] 补 `currentTimeAtom` / `audioCoverArtAtom` / `customAccentColorAtom` / `useCustomAccentAtom`
- [x] `preview.ts` 补 4 个 Spicy 设置 atom
- [x] 新增 `useAudioCoverArt` hook：把 `audioEngine.cover` 同步成 object URL
      （依赖 `loadedAudioAtom` + `audioEngineStateAtom`，因为音频引擎只派发 `timeupdate` / `volume-change`，
      没有「加载完成」事件）
- [x] `@kawarp/core@1.2.2` 装好（无依赖，直接 tarball 解包；npm 在 pnpm 装的 node_modules 上会炸
      `Cannot read properties of null`）
- [x] `App.tsx` 切到新组件；Ribbon 加了 Spicy 分区（仅在选中 spicy 渲染器时显示）
- [x] 旧 port 移到 `.backup/`
- [x] 清掉只为旧 port 服务的依赖：`cubic-spline` / `d3-ease` / `fast-xml-parser`
- [x] `tsc -b` + `vite build` 通过；字体与 kawarp 都进了产物

## 适配时的改动（相对上游）

- `model.ts`：`word.romanWord` 在 AMLL 的类型里是可选的（`romanWord?: string`），
  上游是必填。加了 `?? ""` / `?? word.word` 兜底
- `index.tsx`：`customBackgroundImageAtom` 的导入路径改成
  `$/modules/settings/states/custom-background`（本项目导出在这里，不在 modals 下）
- `model.test.ts` 删除（无 vitest）

## 待 AJ 验证

- 字号 / 行距 / 字体是否真的用上了 SpicyLyrics
- 扫光是否顺滑（开 FPS 计数看是否跑满）
- 三种背景模式在 Tauri webview 里的表现（尤其 animated 的 WebGL）

## 许可证

他们的文件头写明：`Adapted from the Spicy Lyrics renderer (AGPL-3.0-or-later)`。
本项目是 GPLv3，Spicy 是 AGPLv3 —— §13 允许合并，合并后的作品按 AGPLv3 传播。
和现有 vendor 目录的性质一样，不新增风险。
