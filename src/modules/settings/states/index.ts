import { atomWithStorage } from "jotai/utils";

export enum SyncJudgeMode {
	FirstKeyDownTime = "first-keydown-time",
	FirstKeyDownTimeLegacy = "first-keydown-time-legacy",
	LastKeyUpTime = "last-keyup-time",
	MiddleKeyTime = "middle-key-time",
}

export enum LayoutMode {
	Simple = "simple",
	Advance = "advance",
}

export enum TranslationOutputMode {
	/** Apple Music 样式：逐行翻译/音译写入 `<head>` 的 `<iTunesMetadata>` 中 */
	AppleMusic = "apple-music",
	/** AMLL 样式：逐行翻译/音译写入为内嵌的 `x-translation` / `x-roman` */
	Amll = "amll",
}

export const latencyTestBPMAtom = atomWithStorage("latencyTestBPM", 120);

export const syncJudgeModeAtom = atomWithStorage(
	"syncJudgeMode",
	SyncJudgeMode.FirstKeyDownTime,
);

export const layoutModeAtom = atomWithStorage("layoutMode", LayoutMode.Simple);

export const translationOutputModeAtom = atomWithStorage(
	"translationOutputMode",
	TranslationOutputMode.AppleMusic,
);

/**
 * 允许叠加背景歌词。
 *
 * 开启后：
 * - 保存时，连续的多条背景行会全部写进上一个主行的 `<p>` 里（多个 `x-bg` span），
 *   而不是只有第一条是背景、其余被写成普通行。
 * - 打开时，同一个 `<p>` 里的多个 `x-bg` span 会被拆回多条独立的背景行，
 *   而不是合并成一条（旧版会合并并弄乱括号）。
 */
export const allowStackedBgVocalsAtom = atomWithStorage(
	"allowStackedBgVocals",
	false,
);

export const showWordRomanizationInputAtom = atomWithStorage(
	"showWordRomanizationInput",
	false,
);

export const displayRomanizationInSyncAtom = atomWithStorage(
	"displayRomanizationInSync",
	false,
);

export const showLineTranslationAtom = atomWithStorage(
	"showLineTranslation",
	true,
);

export const showLineRomanizationAtom = atomWithStorage(
	"showLineRomanization",
	true,
);

export const hideSubmitAMLLDBWarningAtom = atomWithStorage(
	"hideSubmitAMLLDBWarning",
	false,
);
export const generateNameFromMetadataAtom = atomWithStorage(
	"generateNameFromMetadata",
	true,
);

export const autosaveEnabledAtom = atomWithStorage("autosaveEnabled", true);
export const autosaveIntervalAtom = atomWithStorage("autosaveInterval", 10);
export const autosaveLimitAtom = atomWithStorage("autosaveLimit", 10);

export const defaultTtmlAuthorGithubAtom = atomWithStorage(
	"defaultTtmlAuthorGithub",
	"",
);

export const defaultTtmlAuthorGithubLoginAtom = atomWithStorage(
	"defaultTtmlAuthorGithubLogin",
	"",
);

export const showTimestampsAtom = atomWithStorage("showTimestamps", true);

export const highlightActiveWordAtom = atomWithStorage(
	"highlightActiveWord",
	true,
);

export const highlightErrorsAtom = atomWithStorage("highlightErrors", false);

/**
 * 在底部波形上为每个已打轴的字画一根竖线标记；带音节的字则用紫色、每个音节一根。
 * 只要有起始轴（start > 0）就显示，不要求已经打了结束轴。
 */
export const showSyncedWordMarkersAtom = atomWithStorage(
	"showSyncedWordMarkers",
	true,
);

export const smartFirstWordAtom = atomWithStorage("smartFirstWord", false);
export const smartLastWordAtom = atomWithStorage("smartLastWord", false);

export const enableAutoRomanizationPredictionAtom = atomWithStorage(
	"enableAutoRomanizationPrediction",
	false,
);

/** 是否使用自定义强调色（Spicy 预览背景、高亮等会用到） */
export const useCustomAccentAtom = atomWithStorage<boolean>(
	"useCustomAccent",
	false,
);

export const customAccentColorAtom = atomWithStorage<string>(
	"customAccentColor",
	"#e5484d",
);

export { stretchAlgorithmAtom } from "$/modules/audio/states";
export type { StretchAlgorithm } from "$/modules/ffmpeg/types.ts";
