// 打轴设置

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface Callback<Args extends unknown[], Result = void> {
	onEmit?: (...args: Args) => Result;
}

const c = <Args extends unknown[], Result = void>(
	_onEmit: (...args: Args) => Result,
): Callback<Args, Result> => ({});

export const showTouchSyncPanelAtom = atomWithStorage("touchSyncPanel", false);
export const visualizeTimestampUpdateAtom = atomWithStorage(
	"visualizeTimestampUpdate",
	false,
);
export const syncTimeOffsetAtom = atomWithStorage("syncTimeOffset", 0);

/**
 * 打开后，按“起始轴”(F) 时会自动把“当前字”的开始时间也写进“上一个字”的结束时间。
 * 方便逐字打轴时按 F 即可同时闭合上字，避免来回手动打开始/结束。
 */
export const autoClosePrevOnMarkBeginAtom = atomWithStorage(
	"autoClosePrevOnMarkBegin",
	false,
);

/**
 * 「时间」Ribbon 最右边那个「Toggle Spicy Lyrics」按钮控制的右侧预览面板。
 * 打开后在编辑区右边常驻一块 Spicy 歌词渲染，可以一边打轴一边看效果。
 */
export const showSpicySyncPanelAtom = atomWithStorage("spicySyncPanel", false);

/**
 * 上面那个面板的宽度（px）。拖面板左边的手柄可以改，会自动存下来。
 */
export const spicySyncPanelWidthAtom = atomWithStorage("spicySyncPanelWidth", 380);

/**
 * 右侧 Spicy 预览面板的省电模式，默认开。
 *
 * 面板开着的时候整页只有 30fps 左右（关掉就正常），所以小面板默认走省电路线：
 * 动画窗口 ±12 → ±4 行，并且不画每行那圈 text-shadow 发光。
 * 想要全效果就把它关掉，和全屏预览一样。
 */
export const spicySyncPanelLiteAtom = atomWithStorage("spicySyncPanelLite", true);

/**
 * 右侧 Spicy 预览面板的自动刷新间隔（秒）。0 = 不自动刷新。
 *
 * 整块重挂载会丢掉所有 spring 缓存、重建 DOM、重建 kawarp 实例，
 * 所以刷新那一下会有一次跳变 —— 默认关着，需要的人自己开。
 */
export const spicyAutoRefreshSecAtom = atomWithStorage("spicyAutoRefreshSec", 0);

/**
 * 打开后，“起始轴自动闭合上一字”不再限于同一行：
 * 在下一行的首个字上按“起始轴”(F)，也会把**上一行最后一个字**的结束时间补上，
 * 并顺手把上一行的 endTime 顶到当前时间。
 *
 * 不打开时的行为（原来的行为）是只在同一行内闭合 —— 换行时如果把上一行末字的 end
 * 顶到下一行首字的 begin，会让上一行末字凭空多出一段时长，所以默认是关的。
 *
 * 依赖 `autoClosePrevOnMarkBeginAtom`：只有“起始轴自动闭合上一字”开着时它才生效。
 */
export const autoClosePrevAcrossLinesAtom = atomWithStorage(
	"autoClosePrevAcrossLines",
	false,
);

/**
 * 打开后，按“起始轴”(F) 打完当前字的起始时间，会自动把光标移到下一字，
 * 这样跟着音乐一路按 F 就能串下来，不用每打一下再手动点下一个字。
 *
 * 依赖 `autoClosePrevOnMarkBeginAtom`：只有“起始轴自动闭合上一字”开着时它才生效，
 * 否则上一字的结束时间没人填，跳走只会留下一堆没有 end 的半截轴。
 */
export const autoAdvanceOnMarkBeginAtom = atomWithStorage(
	"autoAdvanceOnMarkBegin",
	false,
);

/**
 * Alt + ←/→ 微调所选字（或音节）时间时的步长，单位毫秒。
 */
export const nudgeStepMsAtom = atomWithStorage("nudgeStepMs", 10);

export const currentEmptyBeatAtom = atom(0);
export const smartFirstWordActiveIdAtom = atom<string | null>(null);

export const callbackSyncStartAtom = atom(c(() => {}));
export const callbackSyncNextAtom = atom(c(() => {}));
export const callbackSyncEndAtom = atom(c(() => {}));
