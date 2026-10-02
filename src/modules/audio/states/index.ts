import { atom } from "jotai/index";
import { atomWithStorage } from "jotai/utils";
import type { EngineState, StretchAlgorithm } from "$/modules/ffmpeg/types.ts";
import type { BpmAnalysisResult } from "$/modules/ffmpeg/worker/wasm/bpm-analyzer/bpm_analyzer_wasm";

export type BpmState =
	| { status: "idle" }
	| { status: "analyzing" }
	| {
			status: "completed";
			result: BpmAnalysisResult;
			calculationTime: number;
	  }
	| {
			status: "error";
			error: string;
	  };

export const bpmStateAtom = atom<BpmState>({ status: "idle" });
export const bpmScaleAtom = atom<number>(1);
export const bpmFollowPlaybackRateAtom = atomWithStorage(
	"bpmFollowPlaybackRate",
	true,
);

export const audioEngineStateAtom = atom<EngineState>("idle");
export const volumeAtom = atomWithStorage("volume", 0.5);
export const playbackRateAtom = atomWithStorage("playbackRate", 1);
// 默认用 WSOLA：时域算法，拖动播放头后重新开始播放时几乎没有渐入 / 启动延迟，
// 而 Spectral（频域相位声码器）在 seek 后需要重新填充分析窗口，会听出一段快速渐入。
// 仍可在「编辑 → 首选项 → 音频变速算法」里改回 Spectral。
export const stretchAlgorithmAtom = atomWithStorage<StretchAlgorithm>(
	"stretchAlgorithm",
	"wsola",
);
export const audioPlayingAtom = atom(false);
export const loadedAudioAtom = atom(new Blob([]));
export const currentDurationAtom = atom(0);
export const isAuditioningAtom = atom(false);
export const audioErrorAtom = atom<string | null>(null);
export const pcmDataReadyAtom = atom(false);

export type BpmTapMode = "off" | "key" | "spectrogram";
export const bpmTapModeAtom = atom<BpmTapMode>("off");
export const tapTimesAtom = atom<number[]>([]);
export const totalTapCountAtom = atom<number>(0);
export const hasSeenTapWindowTipAtom = atomWithStorage(
	"hasSeenTapWindowTip",
	false,
);

/** 节拍器开关。全局生效，BPM 面板关掉之后也继续响。 */
export const metronomeEnabledAtom = atomWithStorage("metronomeEnabled", false);
/** 节拍器音量，0–1。独立于音乐音量，这样在音乐上也能听见。 */
export const metronomeVolumeAtom = atomWithStorage("metronomeVolume", 0.6);

/** 当前播放位置（毫秒）。点击歌词行跳转时会写入，供播放器 UI 同步。 */
export const currentTimeAtom = atom(0);
/** 已加载音频里内嵌的封面图（data URL / object URL），没有则为 null */
export const audioCoverArtAtom = atom<string | null>(null);
