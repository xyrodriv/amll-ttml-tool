/*
 * Adapted from the Spicy Lyrics renderer (AGPL-3.0-or-later).
 * Original project: https://github.com/Spikerko/Spicy-Lyrics
 */
import classNames from "classnames";
import { useAtomValue, useSetAtom } from "jotai";
import {
	type CSSProperties,
	memo,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import { audioCoverArtAtom, currentTimeAtom } from "$/modules/audio/states";
import { customBackgroundImageAtom } from "$/modules/settings/states/custom-background";
import {
	customAccentColorAtom,
	useCustomAccentAtom,
} from "$/modules/settings/states";
import {
	showRomanLinesAtom,
	showFpsCounterAtom,
	showTranslationLinesAtom,
	spicyBackgroundModeAtom,
	spicyForceLineSyncedAtom,
	spicySimpleLyricsModeAtom,
} from "$/modules/settings/states/preview";
import { lyricLinesAtom } from "$/states/main";
import styles from "./index.module.css";
import { CubicSpline, progressAt, Spring, stateAt } from "./math";
import {
	buildSpicyLines,
	groupSpicyTokens,
	isRtl,
	type SpicyLine,
	type SpicyToken,
} from "./model";

type KawarpInstance = {
	dispose(): void;
	loadImage(url: string): Promise<void>;
	start(): void;
	setOptions(options: {
		animationSpeed?: number;
		transitionDuration?: number;
	}): void;
};
type SpringSet = {
	scale: Spring;
	y: Spring;
	/** Only present on letter-split syllables, which are the only nodes that travel horizontally. */
	x?: Spring;
	glow: Spring;
	opacity: Spring;
};
type CoverPalette = { base: string; highlight: string };
type SlmAnimation = {
	animation?: Animation;
	phase: "idle" | "pre" | "fill" | "sung";
};

const scaleSpline = new CubicSpline([
	[0, 0.95],
	[0.7, 1.0505],
	[1, 1],
]);
const letterScaleSpline = new CubicSpline([
	[0, 0.95],
	[0.7, 1.175],
	[1, 1],
]);
const ySpline = new CubicSpline([
	[0, 0.01],
	[0.9, -1 / 60],
	[1, 0],
]);
const letterYSpline = new CubicSpline([
	[0, 0.01],
	[0.9, -1 / 56],
	[1, 0],
]);
const simpleYSpline = new CubicSpline([
	[0, 0.01],
	[1, -0.033],
]);
const simpleLetterScaleSpline = new CubicSpline([
	[0, 0.95],
	[0.7, 1.07],
	[1, 1],
]);
const simpleLetterYSpline = new CubicSpline([
	[0, 0.01],
	[0.9, -1 / 62],
	[1, 0],
]);
/**
 * Horizontal "spread outward" travel. Upstream Spicy only ever moves letters on
 * the Y axis, so this is an addition rather than a port: each syllable pushes
 * away from the centre of its group while it is being sung, then springs back.
 * Peaks early so the shove reads as a bounce, not a drift.
 */
const outwardXSpline = new CubicSpline([
	[0, 0],
	[0.42, 0.12],
	[1, 0],
]);
const glowSpline = new CubicSpline([
	[0, 0],
	[0.15, 1],
	[0.6, 1],
	[1, 0],
]);
const lineGlowSpline = new CubicSpline([
	[0, 0],
	[0.5, 1],
	[1, 0],
]);
const dotScaleSpline = new CubicSpline([
	[0, 0.75],
	[0.7, 1.05],
	[1, 1],
]);
const dotYSpline = new CubicSpline([
	[0, 0],
	[0.9, -0.12],
	[1, 0],
]);
const dotGlowSpline = new CubicSpline([
	[0, 0],
	[0.6, 1],
	[1, 1],
]);
const dotOpacitySpline = new CubicSpline([
	[0, 0.35],
	[0.6, 1],
	[1, 1],
]);
const simpleDotOpacitySpline = new CubicSpline([
	[0, 0.27],
	[0.6, 1],
	[1, 1],
]);
const easeSinOut = (progress: number) => Math.sin((Math.PI * progress) / 2);

const keyFor = (line: SpicyLine, word: SpicyToken, index: number) =>
	`${line.id}:${word.id}:${index}`;

/**
 * Signed horizontal direction for the outward spread: -1 at the start of the
 * group, +1 at the end, 0 in the middle. With two syllables that gives exactly
 * "left one goes left, right one goes right".
 */
const outwardDirection = (index: number, count: number) => {
	if (count <= 1) return 0;
	const middle = (count - 1) / 2;
	return (index - middle) / middle;
};

/**
 * How many lines above and below the playhead get live spring updates.
 * Everything outside this band is settled and is skipped entirely — animating
 * all ~200 lines of a track every frame is what made long songs degrade.
 */
const LIVE_WINDOW = 12;

/**
 * 小面板（打轴页右侧那块）用的窗口。
 *
 * 面板一次只显示几行，±12 行里绝大部分的 spring 计算是白做的，
 * 而每一次写入都会让该节点 style 失效并重绘 —— 字形是
 * `background-clip: text` + text-shadow，重绘很贵。
 */
const LITE_LIVE_WINDOW = 4;

type CachedNode = HTMLElement & { __spicy?: Record<string, string> };

/**
 * Write an inline style only when the value actually changed.
 *
 * At any moment only one or two nodes in the live window are moving; the rest
 * have springs sitting on their goal. Rewriting an identical value still
 * invalidates style and repaints the glyph, and these glyphs are expensive to
 * repaint (background-clip: text plus a text shadow). Measured cost of the
 * redundant writes was roughly two thirds of the frame rate during playback.
 */
const writeStyle = (node: HTMLElement, property: string, value: string) => {
	const target = node as CachedNode;
	const cache = (target.__spicy ??= {});
	if (cache[property] === value) return;
	cache[property] = value;
	node.style.setProperty(property, value);
};

/**
 * Counterpart to writeStyle. Removing a property has to drop the cached value
 * too, or a later write of the same value would be skipped and leave the
 * property unset.
 */
const clearStyle = (node: HTMLElement, property: string) => {
	const target = node as CachedNode;
	if (target.__spicy) delete target.__spicy[property];
	node.style.removeProperty(property);
};

/** Springs settle asymptotically, so round before comparing or every frame looks "changed". */
const round = (value: number) => value.toFixed(4);

const colorToHex = (red: number, green: number, blue: number) =>
	`#${[red, green, blue]
		.map((value) => Math.round(value).toString(16).padStart(2, "0"))
		.join("")}`;

function useCoverPalette(imageSource: string | null) {
	const [palette, setPalette] = useState<CoverPalette | null>(null);
	useEffect(() => {
		if (!imageSource) {
			setPalette(null);
			return;
		}
		let cancelled = false;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.src = imageSource;
		void image
			.decode()
			.then(() => {
				const canvas = document.createElement("canvas");
				canvas.width = 32;
				canvas.height = 32;
				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (!context) return;
				context.drawImage(image, 0, 0, canvas.width, canvas.height);
				const { data } = context.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				);
				let base = { red: 0, green: 0, blue: 0, weight: 0 };
				let highlight = { red: 0, green: 0, blue: 0, saturation: -1 };
				for (let index = 0; index < data.length; index += 4) {
					const red = data[index];
					const green = data[index + 1];
					const blue = data[index + 2];
					const alpha = data[index + 3] / 255;
					const max = Math.max(red, green, blue);
					const min = Math.min(red, green, blue);
					const saturation = max === 0 ? 0 : (max - min) / max;
					const weight = alpha * (0.35 + saturation * 0.65);
					base.red += red * weight;
					base.green += green * weight;
					base.blue += blue * weight;
					base.weight += weight;
					if (saturation > highlight.saturation && max > 38 && max < 235)
						highlight = { red, green, blue, saturation };
				}
				if (!base.weight || cancelled) return;
				const baseColor = colorToHex(
					base.red / base.weight,
					base.green / base.weight,
					base.blue / base.weight,
				);
				setPalette({
					base: baseColor,
					highlight:
						highlight.saturation >= 0
							? colorToHex(highlight.red, highlight.green, highlight.blue)
							: baseColor,
				});
			})
			.catch(() => {
				if (!cancelled) setPalette(null);
			});
		return () => {
			cancelled = true;
		};
	}, [imageSource]);
	return palette;
}

function useKawarpBackground(
	container: RefObject<HTMLDivElement | null>,
	image: string | null,
	mode: "animated" | "color" | "static",
) {
	useEffect(() => {
		if (mode !== "animated" || !image || !container.current) return;
		let disposed = false;
		let instance: KawarpInstance | null = null;
		let frame = 0;
		const canvas = document.createElement("canvas");
		canvas.className = styles.backgroundCanvas;
		container.current.replaceChildren(canvas);
		void import("@kawarp/core")
			.then(async ({ default: Kawarp }) => {
				if (disposed) return;
				instance = new Kawarp(canvas, {
					warpIntensity: 1,
					blurPasses: 8,
					animationSpeed: 0.1,
					saturation: 1.5,
					dithering: 0.008,
					tintIntensity: 0,
					scale: 1,
					transitionDuration: 500,
				}) as KawarpInstance;
				await instance.loadImage(image);
				if (disposed) return;
				instance.start();
				const bins = new Uint8Array(audioEngine.analyserNode.frequencyBinCount);
				let lastSpeed = -1;
				const animate = () => {
					audioEngine.analyserNode.getByteFrequencyData(bins);
					const energy =
						bins.reduce((sum, value) => sum + value, 0) / (bins.length * 255);
					const speed = 0.1 + energy * 0.35;
					// 原来这里是每帧都 setOptions。kawarp 的 setOptions 很可能要重建
					// uniform / 重编译着色器，60fps 地调会越跑越沉。
					// 能量变化本来就很平滑，量化一下只在真的变了时才推给它 —— 视觉上没区别。
					if (Math.abs(speed - lastSpeed) > 0.02) {
						lastSpeed = speed;
						instance?.setOptions({ animationSpeed: speed });
					}
					frame = requestAnimationFrame(animate);
				};
				frame = requestAnimationFrame(animate);
			})
			.catch(() => container.current?.replaceChildren());
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			instance?.dispose();
		};
	}, [container, image, mode]);
}

/**
 * Deliberately its own component. The readout updates twice a second, and
 * holding that state in the parent would re-render — and re-attach the inline
 * refs of — every line in the track on every update.
 */
const FpsCounter = ({
	frames,
	diag,
	className,
}: {
	frames: RefObject<{ frames: number }>;
	diag: RefObject<{ live: number; springs: number; nodes: number }>;
	className: string;
}) => {
	const [readout, setReadout] = useState({
		fps: 0,
		live: 0,
		springs: 0,
		nodes: 0,
	});
	useEffect(() => {
		let last = performance.now();
		let lastFrames = frames.current.frames;
		const id = setInterval(() => {
			const now = performance.now();
			const elapsed = now - last;
			if (elapsed <= 0) return;
			setReadout({
				fps: Math.round(((frames.current.frames - lastFrames) * 1000) / elapsed),
				live: diag.current.live,
				springs: diag.current.springs,
				nodes: diag.current.nodes,
			});
			last = now;
			lastFrames = frames.current.frames;
		}, 500);
		return () => clearInterval(id);
	}, [frames, diag]);
	return (
		<div className={className}>
			FPS: {readout.fps} · L{readout.live} S{readout.springs} N{readout.nodes}
		</div>
	);
};

export interface SpicyLyricsProps {
	/**
	 * 省电模式，给打轴页右侧那块小面板用。
	 *
	 * - 动画窗口从 ±12 行收窄到 ±4 行（面板本来就只显示几行）
	 * - 关掉每行那圈 text-shadow 发光（`--blur`）—— 字形是
	 *   `background-clip: text`，带模糊的阴影重绘起来最贵
	 *
	 * 全屏预览不要开，那边要的就是完整效果。
	 */
	lite?: boolean;
}

export const SpicyLyrics = memo(({ lite = false }: SpicyLyricsProps) => {
	const lyrics = useAtomValue(lyricLinesAtom);
	const simple = useAtomValue(spicySimpleLyricsModeAtom);
	const forceLineSynced = useAtomValue(spicyForceLineSyncedAtom);
	const romanized = useAtomValue(showRomanLinesAtom);
	const showTranslation = useAtomValue(showTranslationLinesAtom);
	const showFps = useAtomValue(showFpsCounterAtom);
	const backgroundMode = useAtomValue(spicyBackgroundModeAtom);
	const embeddedCoverArt = useAtomValue(audioCoverArtAtom);
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const useAccent = useAtomValue(useCustomAccentAtom);
	const accent = useAtomValue(customAccentColorAtom);
	const setCurrentTime = useSetAtom(currentTimeAtom);
	const lines = useMemo(
		() =>
			buildSpicyLines(lyrics.lyricLines, simple, romanized, forceLineSynced),
		[lyrics.lyricLines, simple, romanized, forceLineSynced],
	);
	const hasDuetLines = useMemo(
		() => lines.some((line) => !line.isDotLine && line.isDuet),
		[lines],
	);
	// Match Spicy's priority: artwork embedded in the loaded audio file comes first.
	// TTML cover_art and the app-level custom image are only fallbacks.
	const coverArtImage = useMemo(
		() =>
			lyrics.metadata
				.find((entry) => entry.key.toLowerCase() === "cover_art")
				?.value.find((value) => value.trim().length > 0) ?? null,
		[lyrics.metadata],
	);
	const backgroundImage =
		embeddedCoverArt ?? coverArtImage ?? customBackgroundImage;
	const coverPalette = useCoverPalette(backgroundImage);
	const viewportRef = useRef<HTMLDivElement>(null);
	const backgroundRef = useRef<HTMLDivElement>(null);
	const lineNodes = useRef(new Map<string, HTMLDivElement>());
	const wordNodes = useRef(new Map<string, HTMLElement>());
	const springs = useRef(new Map<string, SpringSet>());
	const lineGlowSprings = useRef(new Map<string, Spring>());
	const slmAnimations = useRef(new Map<string, SlmAnimation>());
	const scrollPauseUntil = useRef(0);
	const lastLine = useRef<string | null>(null);
	const lastTime = useRef(performance.now());
	const fpsRef = useRef({ frames: 0 });
	const diagRef = useRef({ at: 0, live: 0, springs: 0, nodes: 0 });
	const showFpsRef = useRef(showFps);
	useKawarpBackground(backgroundRef, backgroundImage, backgroundMode);

	useEffect(() => {
		showFpsRef.current = showFps;
		fpsRef.current.frames = 0;
	}, [showFps]);

	useEffect(() => {
		if (simple) return;
		for (const [key, animation] of slmAnimations.current) {
			animation.animation?.cancel();
			const node = wordNodes.current.get(key);
			if (node) clearStyle(node, "--spicy-slm-gradient-position");
		}
		slmAnimations.current.clear();
	}, [simple]);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const onUserScroll = () => {
			scrollPauseUntil.current = performance.now() + 750;
		};
		viewport.addEventListener("wheel", onUserScroll, { passive: true });
		viewport.addEventListener("touchmove", onUserScroll, { passive: true });
		return () => {
			viewport.removeEventListener("wheel", onUserScroll);
			viewport.removeEventListener("touchmove", onUserScroll);
		};
	}, []);

	// Every cache here is keyed by line/word id, so it has to be dropped when the
	// lyrics are rebuilt — otherwise springs for discarded lines linger forever.
	useEffect(() => {
		springs.current.clear();
		lineGlowSprings.current.clear();
		slmAnimations.current.clear();
	}, [lines]);

	useEffect(() => {
		let raf = 0;
		let previousPosition = -Infinity;
		const animate = (now: number) => {
			if (showFpsRef.current) fpsRef.current.frames++;
			const dt = (now - lastTime.current) / 1000;
			lastTime.current = now;
			const time = Math.max(
				0,
				audioEngine.interpolatedCurrentTime * 1000 +
					(audioEngine.musicPlaying ? 100 : 0) -
					(simple ? 33.5 : 0),
			);
			const activeIndices = lines.flatMap((line, index) =>
				stateAt(time, line.startTime, line.endTime) === "active" ? [index] : [],
			);
			let activeIndex = activeIndices[0] ?? -1;
			if (activeIndices.length > 1) {
				const firstActive = activeIndices[0] ?? -1;
				const lastActive = activeIndices.at(-1) ?? firstActive;
				activeIndex = lastActive - firstActive <= 1 ? firstActive : lastActive;
			}
		const active = activeIndex >= 0 ? lines[activeIndex] : undefined;
		const focusIndex = activeIndex >= 0 ? activeIndex : 0;
		const liveWindow = lite ? LITE_LIVE_WINDOW : LIVE_WINDOW;
		let liveCount = 0;
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const status = stateAt(time, line.startTime, line.endTime);
				const near = Math.abs(i - focusIndex) <= liveWindow;
				if (near) liveCount++;
				const node = lineNodes.current.get(line.id);
				if (node) {
					if (near !== (node.dataset.near === "true"))
						node.dataset.near = String(near);
					// The dimming of every line is driven by data-state, so it has to
					// be written even for lines we are not animating — otherwise
					// distant lyrics would sit at full opacity.
					if (node.dataset.state !== status) node.dataset.state = status;
					const prehidden = String(
						!!line.isDotLine &&
							(status === "not-sung" || time > line.endTime - 500),
					);
					if (node.dataset.prehidden !== prehidden)
						node.dataset.prehidden = prehidden;
				// lite 模式下直接不画这圈发光：text-shadow 的模糊半径是最贵的一项，
				// 而且面板里那点字号根本看不出区别
				const blur = lite
					? 0
					: status === "active"
						? 0
						: Math.min(Math.abs(i - activeIndex) * 1.25, 6.8);
				writeStyle(node, "--blur", `${blur}px`);
					// Everything outside the band has already settled to its resting
					// state, so the spring work below is skipped for it. Line-synced
					// lines still need their resting sweep written, because a seek can
					// park the playhead next to a line that has never been animated
					// and would otherwise keep the CSS "not yet sung" default.
					if (!near) {
						if (line.isLineSynced && !line.isDotLine) {
							writeStyle(
								node,
								"--line-gradient-position",
								simple || status === "sung" ? "100%" : "-20%",
							);
							writeStyle(node, "--line-shadow-alpha", "0");
							writeStyle(node, "--line-shadow-blur", "4px");
						}
						continue;
					}
					if (line.isLineSynced && !line.isDotLine) {
						const lineProgress =
							status === "active"
								? progressAt(time, line.startTime, line.endTime)
								: status === "sung"
									? 1
									: 0;
						if (simple) {
							// The normal line renderer writes this variable inline. Pin it here
							// as well, otherwise switching into SLM leaves a stale mid-sweep
							// normal-mode value that the SLM stylesheet cannot override.
							writeStyle(node, "--line-gradient-position", "100%");
							writeStyle(node, "--line-shadow-alpha", "0");
						} else {
							let glow = lineGlowSprings.current.get(line.id);
							if (!glow) {
								glow = new Spring(0, 1, 0.5);
								lineGlowSprings.current.set(line.id, glow);
							}
							glow.setGoal(lineGlowSpline.at(lineProgress));
							const currentGlow = glow.step(dt);
							writeStyle(
								node,
								"--line-shadow-blur",
								`${round(4 + 8 * currentGlow)}px`,
							);
							writeStyle(
								node,
								"--line-shadow-alpha",
								round(currentGlow * 0.5),
							);
							writeStyle(
								node,
								"--line-gradient-position",
								`${round(status === "active" ? lineProgress * 100 : status === "sung" ? 100 : -20)}%`,
							);
						}
					}
				}
			}
			for (let li = 0; li < lines.length; li++) {
				const line = lines[li];
				if (line.isLineSynced && !line.isDotLine) continue;
				else if (Math.abs(li - focusIndex) > liveWindow) continue;
				else
				for (let wi = 0; wi < line.words.length; wi++) {
					const word = line.words[wi];
					const rootKey = keyFor(line, word, wi);
					// Spicy's TimeSetter cascades the line state to every child when
					// the line itself is not active. This matters for adjusted held-word
					// timings near a line boundary.
					const wordState =
						stateAt(time, line.startTime, line.endTime) === "active"
							? stateAt(time, word.startTime, word.endTime)
							: stateAt(time, line.startTime, line.endTime);
					const progress =
						wordState === "active"
							? progressAt(time, word.startTime, word.endTime)
							: wordState === "sung"
								? 1
								: 0;
					const slmStateFor = (nodeKey: string) => {
						let result = slmAnimations.current.get(nodeKey);
						if (!result) {
							result = { phase: "idle" };
							slmAnimations.current.set(nodeKey, result);
						}
						return result;
					};
					const pinSlmGradient = (
						nodeKey: string,
						node: HTMLElement | undefined,
						position: "-50%" | "100%",
					) => {
						if (!node) return;
						const animation = slmStateFor(nodeKey);
						const phase = position === "100%" ? "sung" : "idle";
						if (animation.phase === phase) return;
						animation.animation?.cancel();
						animation.animation = undefined;
						animation.phase = phase;
						node.style.setProperty("--spicy-slm-gradient-position", position);
					};
					const runSlmAnimation = (
						nodeKey: string,
						node: HTMLElement | undefined,
						phase: "pre" | "fill",
						duration: number,
					) => {
						if (!node || !simple) return;
						const animation = slmStateFor(nodeKey);
						if (animation.phase === phase) return;
					animation.animation?.cancel();
					clearStyle(node, "--spicy-slm-gradient-position");
					animation.phase = phase;
						animation.animation = node.animate(
							phase === "fill"
								? [
										{ "--spicy-slm-gradient-position": "-27.5%" },
										{ "--spicy-slm-gradient-position": "100%" },
									]
								: [
										{ "--spicy-slm-gradient-position": "-50%" },
										{ "--spicy-slm-gradient-position": "-27.5%" },
									],
							{
								duration: Math.max(0, duration),
								easing: "linear",
								fill: "forwards",
							},
						);
					};
					const prefillToken = (
						next: SpicyToken | undefined,
						nextIndex: number,
					) => {
						if (
							!next ||
							stateAt(time, next.startTime, next.endTime) !== "not-sung"
						)
							return;
						const nextKey = keyFor(line, next, nextIndex);
						if (next.letters) {
							for (let index = 0; index < next.letters.length; index++) {
								const letterStart =
									next.startTime +
									index *
										((next.endTime - next.startTime) / next.letters.length);
								runSlmAnimation(
									`${nextKey}:${letterStart}`,
									wordNodes.current.get(`${nextKey}:${letterStart}`),
									"pre",
									125,
								);
							}
						} else
							runSlmAnimation(
								nextKey,
								wordNodes.current.get(nextKey),
								"pre",
								125,
							);
					};
					const animateNode = (
						nodeKey: string,
						node: HTMLElement | undefined,
						p: number,
						isDot = false,
						letter = false,
					) => {
						if (!node) return;
						let set = springs.current.get(nodeKey);
						// A set built for the first time starts at its rest pose. Snap it
						// on this frame, otherwise seeking into the middle of a track
						// makes untouched lines spring in from rest instead of appearing
						// already sung.
						const fresh = !set;
						if (!set) {
							set = {
								scale: new Spring(
									isDot ? 0.75 : 0.95,
									isDot ? 0.7 : 0.88,
									isDot ? 0.6 : 0.64,
								),
								y: new Spring(isDot ? 0 : 0.01, isDot ? 1.25 : 1.45, 0.4),
								glow: new Spring(0, isDot ? 1 : 1.18, isDot ? 0.5 : 0.56),
								opacity: new Spring(isDot ? 0.35 : 1, 1, 0.5),
							};
							springs.current.set(nodeKey, set);
						}
						const scale = (
							isDot ? dotScaleSpline : letter ? letterScaleSpline : scaleSpline
						).at(p);
						const y = (
							isDot
								? dotYSpline
								: letter
									? simple
										? simpleLetterYSpline
										: letterYSpline
									: simple
										? simpleYSpline
										: ySpline
						).at(p);
						const glow = (isDot ? dotGlowSpline : glowSpline).at(p);
						const simpleWord = simple && !isDot && !letter;
						const simpleDot = simple && isDot;
					if (!simpleWord && !simpleDot) {
						set.scale.setGoal(scale, fresh);
						set.glow.setGoal(glow, fresh);
					}
					if (!simpleDot) set.y.setGoal(y, fresh);
					set.opacity.setGoal(
						isDot
							? simple
								? simpleDotOpacitySpline.at(p)
								: dotOpacitySpline.at(p)
							: 1,
						fresh,
					);
						const currentScale =
							simpleWord || simpleDot ? 1 : set.scale.step(dt);
						const currentY = simpleDot ? 0 : set.y.step(dt);
						const currentGlow = simpleWord || simpleDot ? 0 : set.glow.step(dt);
						// Spicy keeps translate and scale independent. Dots are 1.3× the
						// line font, but their vertical bounce is still measured against the
						// base lyric size, not their enlarged glyph size.
						// Whole-word tokens only ever travel vertically — the horizontal
						// outward spread is reserved for letter-split syllables.
						writeStyle(
							node,
							"transform",
							isDot
								? `translate3d(0, calc(var(--line-size) * ${round(currentY)}), 0)`
								: `translate3d(0, ${round(currentY)}em, 0)`,
						);
						writeStyle(node, "scale", round(currentScale));
						if (!isDot) {
							if (simple) {
								const duration = word.endTime - word.startTime;
								if (wordState === "active") {
									runSlmAnimation(nodeKey, node, "fill", duration);
									if (time >= word.startTime + duration * 0.6 - 22)
										prefillToken(line.words[wi + 1], wi + 1);
								} else
									pinSlmGradient(
										nodeKey,
										node,
										wordState === "sung" ? "100%" : "-50%",
									);
							} else
								writeStyle(
									node,
									"--gradient-position",
									`${round(wordState === "active" ? -20 + 120 * p : wordState === "sung" ? 100 : -20)}%`,
								);
						}
						writeStyle(
							node,
							"--shadow-blur",
							`${round(4 + (letter ? 12 : isDot ? 6 : 2) * currentGlow)}px`,
						);
						writeStyle(
							node,
							"--shadow-alpha",
							round(
								Math.min(1, currentGlow * (isDot ? 0.9 : letter ? 1 : 0.35)),
							),
						);
						if (isDot)
							writeStyle(node, "opacity", round(set.opacity.step(dt)));
					};
					const animateHeldGroup = (
						nodeKey: string,
						node: HTMLElement | undefined,
						p: number,
					) => {
						if (!node) return;
						let set = springs.current.get(nodeKey);
						const fresh = !set;
						if (!set) {
							set = {
								scale: new Spring(0.95, 0.88, 0.64),
								y: new Spring(0.01, 1.45, 0.4),
								glow: new Spring(0, 1.18, 0.56),
								opacity: new Spring(1, 1, 0.5),
							};
							springs.current.set(nodeKey, set);
						}
						// SLM deliberately disables the normal word bounce and glow. Held
						// letters retain their own smaller proximity effects below.
						if (!simple) {
							set.scale.setGoal(scaleSpline.at(p), fresh);
							set.glow.setGoal(glowSpline.at(p), fresh);
						}
						set.y.setGoal((simple ? simpleYSpline : ySpline).at(p), fresh);
						const currentScale = simple ? 1 : set.scale.step(dt);
						const currentY = set.y.step(dt);
						writeStyle(node, "transform", `translateY(${round(currentY)}em)`);
						writeStyle(node, "scale", round(currentScale));
					};
					const animateHeldLetters = (
						word: SpicyToken,
						rootKey: string,
						groupState: "not-sung" | "active" | "sung",
					) => {
						if (!word.letters) return;
						const letterDuration =
							(word.endTime - word.startTime) / word.letters.length;
						const letterInfo = word.letters.map((_, index) => {
							const start = word.startTime + index * letterDuration;
							return { start, end: start + letterDuration };
						});
						const activeIndex =
							groupState === "active"
								? letterInfo.findIndex(
										({ start, end }) => stateAt(time, start, end) === "active",
									)
								: -1;
						const activeProgress =
							activeIndex === -1
								? 0
								: progressAt(
										time,
										letterInfo[activeIndex].start,
										letterInfo[activeIndex].end,
									);
						const letterScale = simple
							? simpleLetterScaleSpline
							: letterScaleSpline;
						const letterY = simple ? simpleLetterYSpline : letterYSpline;
						const wordDuration = word.endTime - word.startTime;
						if (
							simple &&
							groupState === "active" &&
							time >= word.startTime + wordDuration * 0.845 - 130
						)
							prefillToken(line.words[wi + 1], wi + 1);
						// RTL groups lay their first glyph on the right, so the outward
						// direction has to mirror or the spread would pull inward.
						const rtlWord = isRtl(word.text);
						for (let index = 0; index < letterInfo.length; index++) {
							const { start, end } = letterInfo[index];
							const nodeKey = `${rootKey}:${start}`;
							const node = wordNodes.current.get(nodeKey);
							if (!node) continue;
						let set = springs.current.get(nodeKey);
						const fresh = !set;
						if (!set) {
							set = {
								scale: new Spring(letterScale.at(0), 0.88, 0.64),
								y: new Spring(letterY.at(0), 1.45, 0.4),
								x: new Spring(0, 1.35, 0.42),
								glow: new Spring(glowSpline.at(0), 1.18, 0.56),
								opacity: new Spring(1, 1, 0.5),
							};
							springs.current.set(nodeKey, set);
						}
						const outward =
							outwardDirection(index, letterInfo.length) * (rtlWord ? -1 : 1);

							// Spicy has distinct whole-group branches: before a held word, every
							// letter rests; after it, every letter finishes at its sung value. The
							// per-letter proximity wave only runs while its group is active.
							const letterState =
								groupState === "active"
									? stateAt(time, start, end)
									: groupState;
						let targetScale = letterScale.at(groupState === "sung" ? 1 : 0);
						let targetY = letterY.at(groupState === "sung" ? 1 : 0);
						let targetX = 0;
						let targetGlow = glowSpline.at(groupState === "sung" ? 1 : 0);
						if (groupState === "active" && activeIndex !== -1) {
							const progress = simple
								? progressAt(time, word.startTime, word.endTime)
								: activeProgress;
							const strength =
								word.endTime - word.startTime > 1500
									? { glow: 0.4, y: 0.45, scale: 1.103, x: 0.85 }
									: { glow: 0.285, y: 0.1, scale: 1.09, x: 0.6 };
							const baseScale =
								letterScale.at(progress) * (simple ? strength.scale : 1);
							const baseY = letterY.at(progress) * (simple ? strength.y : 1);
							const baseX = outwardXSpline.at(progress) * (simple ? strength.x : 1);
							const baseGlow =
								glowSpline.at(progress) * (simple ? strength.glow : 1);
							const distance = Math.abs(index - activeIndex);
							const falloff = 1 / (1 + distance ** 2.8);
							const glowFalloff = 1 / (1 + distance * 0.9);
							targetScale += (baseScale - targetScale) * falloff;
							targetY += (baseY - targetY) * falloff;
							targetX += (baseX - targetX) * falloff;
							targetGlow += (baseGlow - targetGlow) * glowFalloff;
						}
							if (
								groupState === "active" &&
								letterState === "not-sung" &&
								!simple
							) {
								targetScale = letterScale.at(0);
								targetY = letterY.at(0);
								targetGlow = glowSpline.at(0);
							} else if (
								groupState === "active" &&
								letterState === "sung" &&
								activeIndex === -1
							) {
								targetGlow = glowSpline.at(0.2);
							}
						set.scale.setGoal(targetScale, fresh);
						set.y.setGoal(targetY, fresh);
						set.x?.setGoal(targetX * outward, fresh);
						set.glow.setGoal(targetGlow, fresh);
						const currentScale = set.scale.step(dt);
						const currentY = set.y.step(dt);
						const currentX = set.x?.step(dt) ?? 0;
						const currentGlow = set.glow.step(dt);
							const gradient =
								groupState === "sung"
									? 100
									: groupState === "not-sung"
										? simple
											? -50
											: -20
										: letterState === "sung"
											? 100
											: letterState === "active" && index === activeIndex
												? (simple ? -50 : -20) +
													120 * easeSinOut(activeProgress)
												: simple
													? -50
													: -20;
							if (simple) {
								if (letterState === "active")
									runSlmAnimation(nodeKey, node, "fill", end - start);
								else
									pinSlmGradient(
										nodeKey,
										node,
										letterState === "sung" ? "100%" : "-50%",
									);
							} else
								writeStyle(
									node,
									"--gradient-position",
									`${round(gradient)}%`,
								);
						writeStyle(
							node,
							"transform",
							`translate(${round(currentX)}em, ${round(currentY * 2)}em)`,
						);
						writeStyle(node, "scale", round(currentScale));
						writeStyle(
							node,
							"--shadow-blur",
							`${round(4 + 12 * currentGlow)}px`,
						);
						writeStyle(
							node,
							"--shadow-alpha",
							round(Math.min(1, currentGlow * 1.85)),
						);
						}
					};
					if (line.isDotLine)
						animateNode(
							rootKey,
							wordNodes.current.get(rootKey),
							progress,
							true,
						);
					else if (word.letters) {
						animateHeldGroup(rootKey, wordNodes.current.get(rootKey), progress);
						animateHeldLetters(word, rootKey, wordState);
					} else animateNode(rootKey, wordNodes.current.get(rootKey), progress);
				}
			}
			const allSung = lines.every(
				(line) => stateAt(time, line.startTime, line.endTime) === "sung",
			);
			const shouldForce =
				lastLine.current === null || Math.abs(time - previousPosition) > 1000;
			const scrollTarget = allSung ? lines.at(-1) : active;
			const scrollNode = scrollTarget
				? lineNodes.current.get(scrollTarget.id)
				: undefined;
			const viewport = viewportRef.current;
			// getBoundingClientRect forces a synchronous layout, and we have just
			// written inline styles on every live node. Only pay for it when a
			// scroll is actually possible, instead of every single frame.
			let shouldScroll = false;
			if (scrollTarget && scrollNode && viewport) {
				if (shouldForce) shouldScroll = true;
				else if (now > scrollPauseUntil.current && lastLine.current !== scrollTarget.id) {
					const nodeRect = scrollNode.getBoundingClientRect();
					const viewRect = viewport.getBoundingClientRect();
					shouldScroll =
						Math.min(nodeRect.bottom, viewRect.bottom) -
							Math.max(nodeRect.top, viewRect.top) >=
						5;
				}
			}
			if (shouldScroll && scrollTarget && scrollNode && viewport) {
				const target = Math.max(
					0,
					Math.min(
						viewport.scrollHeight - viewport.clientHeight,
						scrollNode.offsetTop -
							(viewport.clientHeight / 2 - scrollNode.offsetHeight / 2) +
							30,
					),
				);
				viewport.scrollTo({
					top: target,
					behavior: shouldForce ? "auto" : "smooth",
				});
				lastLine.current = scrollTarget.id;
			}
			// Diagnostic snapshot for the FPS overlay: if playback really does slow
			// down over time, one of these three numbers has to be climbing.
			if (showFpsRef.current && now - diagRef.current.at > 500) {
				diagRef.current.at = now;
				diagRef.current.live = liveCount;
				diagRef.current.springs = springs.current.size;
				diagRef.current.nodes =
					viewportRef.current?.querySelectorAll("*").length ?? 0;
			}
			previousPosition = time;
			raf = requestAnimationFrame(animate);
		};
		raf = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(raf);
	}, [lines, simple, lite]);

	const seek = (time: number) => {
		setCurrentTime(time);
		audioEngine.seekMusic(time / 1000);
	};
	const renderToken = (
		line: SpicyLine,
		word: SpicyToken,
		wordIndex: number,
		wordBoundary: boolean,
	) => {
		const key = keyFor(line, word, wordIndex);
		const letters = word.letters;
		const className = letters ? styles.letterGroup : styles.word;
		return (
			<span
				key={key}
				ref={(node) => {
					if (node) wordNodes.current.set(key, node);
					else wordNodes.current.delete(key);
				}}
				className={classNames(
					className,
					wordBoundary && styles.wordBoundary,
					word.allowInternalWrap && styles.breakableToken,
				)}
				dir={isRtl(word.text) ? "rtl" : undefined}
			>
				{letters
					? letters
							.map((letter, index) => ({
								letter,
								start:
									word.startTime +
									index *
										((word.endTime - word.startTime) /
											letters.length),
							}))
							.map(({ letter, start }) => (
								<span
									key={`${key}:${start}`}
									ref={(node) => {
										if (node)
											wordNodes.current.set(`${key}:${start}`, node);
										else wordNodes.current.delete(`${key}:${start}`);
									}}
									className={styles.letter}
								>
									{letter}
								</span>
							))
					: word.text}
			</span>
		);
	};
	return (
		<div
			className={classNames(
				styles.root,
				simple && styles.simple,
				lite && styles.lite,
			)}
			style={
				{
					"--spicy-accent": useAccent ? accent : "#5c6cff",
					"--spicy-cover-base": coverPalette?.base,
					"--spicy-cover-highlight": coverPalette?.highlight,
				} as CSSProperties
			}
		>
			<div
				ref={backgroundRef}
				className={classNames(
					styles.background,
					backgroundMode === "animated" && styles.animatedBackground,
				)}
			/>
			{backgroundMode === "color" ? (
				<div className={styles.colorBackground} />
			) : null}
			{backgroundMode === "static" && backgroundImage ? (
				<div
					className={styles.staticBackground}
					style={{ backgroundImage: `url("${backgroundImage}")` }}
				/>
			) : null}
			{backgroundMode === "static" && !backgroundImage ? (
				<div className={styles.staticFallback} />
			) : null}
			<div className={styles.overlay} />
			{showFps ? (
				<FpsCounter
					frames={fpsRef}
					diag={diagRef}
					className={styles.fpsCounter}
				/>
			) : null}
			<div
				ref={viewportRef}
				className={classNames(
					styles.viewport,
					hasDuetLines && styles.hasDuetLines,
				)}
			>
				{lines.map((line) => (
					<div
						key={line.id}
						ref={(node) => {
							if (node) lineNodes.current.set(line.id, node);
							else lineNodes.current.delete(line.id);
						}}
						className={classNames(
							styles.line,
							line.isDotLine && styles.dotLine,
						line.isLineSynced && styles.lineSynced,
						line.isRtl && styles.rtl,
							line.isBackground && styles.backgroundLine,
							line.isDuet && styles.duet,
					)}
					dir={line.isRtl ? "rtl" : undefined}
						onClick={() => seek(line.startTime)}
					>
						{line.isDotLine ? (
							<div className={styles.dotGroup}>
								{line.words.map((word, wi) => {
									const key = keyFor(line, word, wi);
									return (
										<span
											key={key}
											ref={(node) => {
												if (node) wordNodes.current.set(key, node);
												else wordNodes.current.delete(key);
											}}
											className={styles.dot}
										>
											{word.text}
										</span>
									);
								})}
							</div>
						) : line.isLineSynced ? (
							line.text
						) : (
							groupSpicyTokens(line.words).map((group) => {
								const first = group.items[0];
								if (group.items.length === 1)
									return renderToken(
										line,
										first.token,
										first.wordIndex,
										group.hasTrailingSpace,
									);
								return (
									<span
										key={`group:${keyFor(line, first.token, first.wordIndex)}`}
										className={classNames(
											styles.wordGroup,
											group.hasTrailingSpace && styles.wordBoundary,
										)}
									>
										{group.items.map(({ token, wordIndex }) =>
											renderToken(line, token, wordIndex, false),
										)}
									</span>
								);
							})
						)}
						{showTranslation && !line.isDotLine && line.translation ? (
							<span className={styles.translation}>{line.translation}</span>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
});

export default SpicyLyrics;
