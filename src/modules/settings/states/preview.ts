import { atomWithStorage } from "jotai/utils";

export const showTranslationLinesAtom = atomWithStorage(
	"showTranslationLines",
	false,
);
export const showRomanLinesAtom = atomWithStorage("showRomanLines", false);
export const hideObsceneWordsAtom = atomWithStorage("hideObsceneWords", false);
export const lyricWordFadeWidthAtom = atomWithStorage(
	"lyricWordFadeWidth",
	0.5,
);

/**
 * Preview 标签页用哪个渲染器。
 * `"amll"` 是自带的 AMLL LyricPlayer；`"spicy"` 是 Spicy Lyrics 渲染器。
 */
export const previewRendererAtom = atomWithStorage<"amll" | "spicy">(
	"previewRenderer",
	"amll",
);

/** 右上角显示 FPS，用来确认扫光动画是否真的跑满帧 */
export const showFpsCounterAtom = atomWithStorage("showFpsCounter", false);

/**
 * Simple Lyrics Mode：Spicy 的另一种观感。
 * 关掉逐字弹跳与发光，改成更朴素的整行推进。
 */
export const spicySimpleLyricsModeAtom = atomWithStorage(
	"spicySimpleLyricsMode",
	false,
);

/** 强制按「整行同步」渲染，即使这份 TTML 其实是逐词打轴的 */
export const spicyForceLineSyncedAtom = atomWithStorage(
	"spicyForceLineSynced",
	false,
);

export type SpicyBackgroundMode = "animated" | "color" | "static";
/**
 * 预览背景：
 * - `animated` 用 @kawarp/core 做 WebGL 动态封面背景
 * - `color`    从封面取色铺渐变
 * - `static`   封面模糊铺底
 */
export const spicyBackgroundModeAtom = atomWithStorage<SpicyBackgroundMode>(
	"spicyBackgroundMode",
	"animated",
);
