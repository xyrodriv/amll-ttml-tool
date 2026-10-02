export * from "./useAudioFeedback";
export * from "./useAudioRegion";
export * from "./useAudioSliderZoom";
export * from "./useBpmControl";
export * from "./useBpmTapEngine";
export * from "./useHoverGuide";
export * from "./useMediaSession";
export * from "./useMetronome";

// Zoom range for the bottom waveform, in px per second.
// The lower bound has to be small enough that a long track can still "fit" the
// strip (a 10-minute track in a 1000px strip needs ~1.7 px/s), and the upper
// bound matches the range the upper spectrogram already allowed.
export const clampZoom = (z: number) => Math.max(0.5, Math.min(z, 10000));
export const clampScroll = (
	s: number,
	currentZoom: number,
	totalDurationMs: number,
	containerWidthPx: number,
) => {
	if (totalDurationMs <= 0) return 0;
	const durationS = totalDurationMs / 1000;
	const totalWidth = durationS * currentZoom;
	const maxScroll = Math.max(0, totalWidth - containerWidthPx);
	return Math.max(0, Math.min(s, maxScroll));
};
export * from "./useAudioCoverArt";
