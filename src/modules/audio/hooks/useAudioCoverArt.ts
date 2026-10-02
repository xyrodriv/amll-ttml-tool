/*
 * 把音频文件里内嵌的封面同步成一个 object URL，供 Spicy 预览背景取色使用。
 *
 * 单独抽出来是因为 `useMediaSession` 里那份 object URL 只在支持
 * `navigator.mediaSession` 的浏览器里才会建，而预览背景不依赖 mediaSession。
 */
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	audioCoverArtAtom,
	audioEngineStateAtom,
	loadedAudioAtom,
} from "$/modules/audio/states";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

/**
 * 音频换源 / 引擎状态变化时重建 object URL 并写进 `audioCoverArtAtom`。
 * 旧的 URL 会 revoke，避免每次导入都泄漏一个 blob。
 *
 * 依赖和 `useMediaSession` 保持一致（`loadedAudio` + `engineState`），
 * 因为音频引擎本身只派发 `timeupdate` / `volume-change` 两个事件，
 * 没有「加载完成」事件可用。
 */
export function useAudioCoverArt() {
	const setCoverArt = useSetAtom(audioCoverArtAtom);
	const loadedAudio = useAtomValue(loadedAudioAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const prevObjectUrlRef = useRef<string | null>(null);

	useEffect(() => {
		const cover = audioEngine.cover;

		if (!cover?.bytes || cover.bytes.byteLength === 0) {
			if (prevObjectUrlRef.current) {
				URL.revokeObjectURL(prevObjectUrlRef.current);
				prevObjectUrlRef.current = null;
			}
			setCoverArt(null);
			return;
		}

		const objectUrl = URL.createObjectURL(
			new Blob([cover.bytes], { type: cover.mime || "image/png" }),
		);
		if (prevObjectUrlRef.current) {
			URL.revokeObjectURL(prevObjectUrlRef.current);
		}
		prevObjectUrlRef.current = objectUrl;
		setCoverArt(objectUrl);
	}, [loadedAudio, engineState, setCoverArt]);

	useEffect(
		() => () => {
			if (prevObjectUrlRef.current) {
				URL.revokeObjectURL(prevObjectUrlRef.current);
				prevObjectUrlRef.current = null;
			}
			setCoverArt(null);
		},
		[setCoverArt],
	);
}

export default useAudioCoverArt;
