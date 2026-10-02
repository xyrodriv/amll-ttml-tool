/*
 * 把节拍器的开关、音量和当前 BPM 接到引擎上。
 *
 * 挂在 App 里而不是 BPM 面板里：开关是全局设置，侧边面板收起来之后
 * 节拍器应该继续响。
 */
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import { metronome } from "$/modules/audio/metronome";
import {
	audioEngineStateAtom,
	metronomeEnabledAtom,
	metronomeVolumeAtom,
} from "$/modules/audio/states";
import { useBpmControl } from "./useBpmControl";

/** 还没有分析出 BPM 时的兜底速度。 */
const FALLBACK_BPM = 120;

export function useMetronome() {
	const enabled = useAtomValue(metronomeEnabledAtom);
	const volume = useAtomValue(metronomeVolumeAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const isPlaying = engineState === "playing";
	const { currentBpm } = useBpmControl();

	useEffect(() => {
		metronome.setBpm(currentBpm ?? FALLBACK_BPM);
	}, [currentBpm]);

	useEffect(() => {
		metronome.setVolume(volume);
	}, [volume]);

	// 只在音轨真的在播的时候响：开关打开但没播放 = 静音。
	useEffect(() => {
		if (!enabled || !isPlaying) {
			metronome.stop();
			return;
		}
		metronome.start();
		return () => metronome.stop();
	}, [enabled, isPlaying]);

	// 标签页切走时浏览器会节流 setInterval，预调度窗口会被拉长导致节拍断裂。
	// 回来时重新对齐一次时间轴。
	useEffect(() => {
		if (!enabled || !isPlaying) return;
		const onVisible = () => {
			if (document.visibilityState !== "visible") return;
			metronome.stop();
			metronome.start();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [enabled, isPlaying]);

	// 音频引擎挂了/换了上下文时也重新对齐，避免使用已经失效的 AudioContext。
	useEffect(() => {
		if (!enabled || !isPlaying) return;
		const ctx = audioEngine.ctx;
		const onStateChange = () => {
			if (ctx.state === "running" && !metronome.isRunning) metronome.start();
		};
		ctx.addEventListener("statechange", onStateChange);
		return () => ctx.removeEventListener("statechange", onStateChange);
	}, [enabled, isPlaying]);
}

export default useMetronome;
