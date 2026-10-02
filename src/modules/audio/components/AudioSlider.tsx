import { Card } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	audioEngineStateAtom,
	currentDurationAtom,
	loadedAudioAtom,
} from "$/modules/audio/states";
import { showSyncedWordMarkersAtom } from "$/modules/settings/states/index.ts";
import { lyricLinesAtom, selectedLinesAtom } from "$/states/main";
import { clampScroll, useHoverGuide } from "../hooks";
import { useWaveformAnalyzer } from "../hooks/useWaveformAnalyzer";
import { useAudioSliderZoom } from "../hooks/useAudioSliderZoom";
import styles from "./AudioSlider.module.css";
import { HoverGuide } from "./HoverGuide";

/** 中键平移结束后，恢复「播放头跟随」前的静默时间（毫秒） */
const FOLLOW_GRACE_MS = 2000;

export const AudioSlider = () => {
	const currentDuration = useAtomValue(currentDurationAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const audioFile = useAtomValue(loadedAudioAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const selectedLines = useAtomValue(selectedLinesAtom);
	const showSyncedWordMarkers = useAtomValue(showSyncedWordMarkersAtom);

	const wsContainerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const maskRef = useRef<HTMLDivElement>(null);

	const isScrubbingRef = useRef(false);
	const scrubProgressRef = useRef(0);
	const [sliderWidthPx, setSliderWidthPx] = useState(0);

	// 中键拖动平移时间轴 / middle-button drag pans the timeline
	const isPanningRef = useRef(false);
	const [isPanning, setIsPanning] = useState(false);
	// 手动平移后留一小段宽限期，避免松手瞬间被「播放头跟随」猛地拽回原位
	const followResumeAtRef = useRef(0);

	// 缩放 / 平移：zoom 为每秒像素数，scrollLeft 为可见窗口左边缘的像素偏移
	const {
		zoom,
		scrollLeft,
		setScrollLeft,
		viewStart,
		viewEnd,
		viewStartSec,
		viewSpanSec,
		animateTo,
		stopAnimation,
		resetZoom,
	} = useAudioSliderZoom(wsContainerRef, sliderWidthPx);

	const pxPerMs = zoom / 1000;

	// rAF 循环需要读到最新值，但又不能每帧重启 effect，所以用 ref 做中转
	const loopRef = useRef({
		currentDuration,
		sliderWidthPx,
		pxPerMs,
		scrollLeft,
		zoom,
		animateTo,
		setScrollLeft,
	});
	useEffect(() => {
		loopRef.current = {
			currentDuration,
			sliderWidthPx,
			pxPerMs,
			scrollLeft,
			zoom,
			animateTo,
			setScrollLeft,
		};
	});

	const {
		hoverState,
		handleContainerMouseMove,
		handleContainerMouseLeave,
		isDraggingRef,
	} = useHoverGuide(sliderWidthPx, viewStartSec, viewSpanSec);

	useWaveformAnalyzer({
		audioFile,
		wsContainerRef,
		canvasRef,
		sliderWidthPx,
		engineState,
		viewStart,
		viewEnd,
	});

	useEffect(() => {
		const container = wsContainerRef.current;
		if (!container) return;

		const observer = new ResizeObserver((entries) => {
			if (entries[0]) {
				setSliderWidthPx(entries[0].contentRect.width);
			}
		});
		observer.observe(container);
		setSliderWidthPx(container.clientWidth);

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		let rafId: number;
		const renderCursor = () => {
			const v = loopRef.current;

			if (v.currentDuration > 0 && cursorRef.current && v.sliderWidthPx > 0) {
				let progress = 0;

				if (isScrubbingRef.current) {
					progress = scrubProgressRef.current;
				} else {
					progress =
						audioEngine.musicCurrentTime / (v.currentDuration / 1000);
				}

				const xPos = progress * v.currentDuration * v.pxPerMs - v.scrollLeft;
				cursorRef.current.style.transform = `translateX(${xPos}px)`;

				if (maskRef.current) {
					const playedRatio = Math.max(0, Math.min(xPos / v.sliderWidthPx, 1));
					maskRef.current.style.transform = `scaleX(${playedRatio})`;
				}

				// 播放时让视图持续跟随播放头，把它稳定停在视图中央
				// （而不是等它跑出边界后再猛地跳回来）
				const zoomedIn =
					v.zoom > 0 &&
					v.sliderWidthPx / v.zoom < v.currentDuration / 1000 - 0.001;

				if (
					!isScrubbingRef.current &&
					!isPanningRef.current &&
					performance.now() >= followResumeAtRef.current &&
					audioEngine.musicPlaying &&
					zoomedIn &&
					v.sliderWidthPx > 0
				) {
					const delta = xPos - v.sliderWidthPx / 2;
					if (Math.abs(delta) > 1) {
						v.animateTo({
							scrollLeft: clampScroll(
								v.scrollLeft + delta,
								v.zoom,
								v.currentDuration,
								v.sliderWidthPx,
							),
						});
					}
				}
			}
			rafId = requestAnimationFrame(renderCursor);
		};
		rafId = requestAnimationFrame(renderCursor);
		return () => cancelAnimationFrame(rafId);
	}, []);

	const selectedRegions = useMemo(() => {
		if (currentDuration <= 0 || sliderWidthPx <= 0) return [];

		const regions: { id: string; left: number; width: number }[] = [];

		for (const line of lyricLines.lyricLines) {
			if (selectedLines.has(line.id)) {
				const left = line.startTime * pxPerMs - scrollLeft;
				const width = (line.endTime - line.startTime) * pxPerMs;
				regions.push({ id: line.id, left, width });
			}
		}
		return regions;
	}, [lyricLines.lyricLines, selectedLines, currentDuration, sliderWidthPx, pxPerMs, scrollLeft]);

	// 已打轴的字在波形上画一根竖线：
	// - 只要有起始轴（start > 0）就画，不要求已经打了结束轴
	// - 带音节的字不画整字标记，改为每个音节一根紫色竖线
	// 这里的 x 是「未平移」的坐标（time * pxPerMs），平移交给外层容器的 transform，
	// 这样播放跟随 / 横向拖动时不会产生任何 React 重渲染。
	const syncedWordMarkers = useMemo(() => {
		if (!showSyncedWordMarkers || currentDuration <= 0 || sliderWidthPx <= 0)
			return [];

		const markers: { key: string; x: number; syllable: boolean }[] = [];

		for (const line of lyricLines.lyricLines) {
			const words = line.words;

			// 源 TTML 里「同一个词被拆成多个 <span>」的音节（如 re/search、Tues/day）
			// 在导入后会变成一串相邻的字，而正常的词间隔会被 ttmlToAmll 拆成一个
			// 只有空白、时间为 0 的「间隔字」。所以判定规则是：
			//   相邻两个字都不是空白字 => 它们属于同一个词 => 都是音节
			const isSpacer = (index: number) =>
				index < 0 ||
				index >= words.length ||
				words[index].word.trim().length === 0;

			// 第 index 个字是否和第 index+1 个字粘连（共同组成一个词）
			const isGluedToNext = (index: number) =>
				index >= 0 &&
				index < words.length - 1 &&
				!isSpacer(index) &&
				!isSpacer(index + 1) &&
				!/\s$/.test(words[index].word);

			const pushMarker = (
				index: number,
				rubyIndex: number | undefined,
				time: number,
				syllable: boolean,
			) => {
				if (time <= 0) return;
				markers.push({
					key:
						rubyIndex === undefined
							? `${line.id}:${index}`
							: `${line.id}:${index}:${rubyIndex}`,
					x: time * pxPerMs,
					syllable,
				});
			};

			let i = 0;
			while (i < words.length) {
				// 空白间隔字自己不画标记
				if (isSpacer(i)) {
					i++;
					continue;
				}

				// 收集一条完整的音节链
				let end = i + 1;
				while (isGluedToNext(end - 1)) end++;

				const chainLength = end - i;

				for (let k = i; k < end; k++) {
					const word = words[k];
					const rubies = word.ruby;

					// 显式标注了 ruby[] 的字优先按 ruby 逐条画（无论链长短都是紫色）
					if (rubies && rubies.length > 0) {
						for (let r = 0; r < rubies.length; r++) {
							pushMarker(k, r, rubies[r].startTime, true);
						}
						continue;
					}

					pushMarker(k, undefined, word.startTime, chainLength >= 2);
				}

				i = end;
			}
		}

		return markers;
	}, [
		showSyncedWordMarkers,
		lyricLines.lyricLines,
		currentDuration,
		sliderWidthPx,
		pxPerMs,
	]);

	/**
	 * 按住中键（滚轮键）拖动 = 平移时间轴，播放头原地不动。
	 * 抓取式（grab）手感：内容跟着指针走，所以往右拖 => scrollLeft 变小。
	 */
	const startTimelinePan = useCallback(
		(startClientX: number) => {
			stopAnimation();

			const v = loopRef.current;
			const startScrollLeft = v.scrollLeft;
			const zoomNow = v.zoom;
			const durationNow = v.currentDuration;
			const widthNow = v.sliderWidthPx;

			isPanningRef.current = true;
			setIsPanning(true);
			followResumeAtRef.current = Number.POSITIVE_INFINITY;

			const handlePanMove = (moveEvent: MouseEvent) => {
				v.setScrollLeft(
					clampScroll(
						startScrollLeft - (moveEvent.clientX - startClientX),
						zoomNow,
						durationNow,
						widthNow,
					),
				);
			};

			const handlePanUp = () => {
				isPanningRef.current = false;
				setIsPanning(false);
				// 松手后再宽限一会儿，让人来得及看清挪过去的位置
				followResumeAtRef.current = performance.now() + FOLLOW_GRACE_MS;

				window.removeEventListener("mousemove", handlePanMove);
				window.removeEventListener("mouseup", handlePanUp);
			};

			window.addEventListener("mousemove", handlePanMove);
			window.addEventListener("mouseup", handlePanUp);
		},
		[stopAnimation],
	);

	const handleTimelineMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (currentDuration <= 0 || sliderWidthPx <= 0) return;
			if (isDraggingRef.current) return;

			// 中键：平移时间轴，不碰播放头
			if (e.button === 1) {
				e.preventDefault();
				startTimelinePan(e.clientX);
				return;
			}
			// 其余非左键（右键等）一律不处理，避免和上下文菜单打架
			if (e.button !== 0) return;

			const rect = e.currentTarget.getBoundingClientRect();

			// 屏幕 x -> 时间，需要把缩放后的可见窗口算进去
			const calculateTimeMs = (clientX: number) => {
				const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
				return (viewStartSec + (x / rect.width) * viewSpanSec) * 1000;
			};

			isScrubbingRef.current = true;
			scrubProgressRef.current =
				calculateTimeMs(e.clientX) / currentDuration;

			const handleScrubMove = (moveEvent: MouseEvent) => {
				scrubProgressRef.current =
					calculateTimeMs(moveEvent.clientX) / currentDuration;
			};

			const handleScrubUp = (upEvent: MouseEvent) => {
				isScrubbingRef.current = false;
				audioEngine.seekMusic(calculateTimeMs(upEvent.clientX) / 1000);

				window.removeEventListener("mousemove", handleScrubMove);
				window.removeEventListener("mouseup", handleScrubUp);
			};

			window.addEventListener("mousemove", handleScrubMove);
			window.addEventListener("mouseup", handleScrubUp);
		},
		[
			currentDuration,
			sliderWidthPx,
			isDraggingRef,
			viewStartSec,
			viewSpanSec,
			startTimelinePan,
		],
	);

	return (
		<Card
			style={{
				alignSelf: "center",
				width: "100%",
				height: "2.5em",
				padding: "0",
			}}
		>
			<section
				className={`${styles.waveformContainer} ${
					isPanning ? styles.waveformContainerPanning : ""
				}`}
				aria-label="Audio Waveform"
				title="滚轮缩放 · Shift+滚轮/中键拖动 平移 · 双击复位"
				ref={wsContainerRef}
				onMouseMove={handleContainerMouseMove}
				onMouseLeave={handleContainerMouseLeave}
				onMouseDown={handleTimelineMouseDown}
				onAuxClick={(e) => {
					// 挡掉中键的自动滚动 / 粘贴行为
					if (e.button === 1) e.preventDefault();
				}}
				onDoubleClick={(e) => {
					e.preventDefault();
					resetZoom();
				}}
			>
				<canvas ref={canvasRef} className={styles.waveformCanvas} />

				<HoverGuide hoverState={hoverState} />

				{syncedWordMarkers.length > 0 && (
					<div
						className={styles.syncedWordMarkersLayer}
						style={{ transform: `translateX(${-scrollLeft}px)` }}
					>
						{syncedWordMarkers.map((marker) => (
							<div
								key={marker.key}
								className={`${styles.syncedWordMarker} ${
									marker.syllable
										? styles.syncedWordMarkerSyllable
										: ""
								}`}
								style={{ left: `${marker.x}px` }}
							/>
						))}
					</div>
				)}

				{selectedRegions.map((region) => (
					<div
						key={region.id}
						className={styles.selectedLyricRegion}
						style={{
							left: `${region.left}px`,
							width: `${region.width}px`,
						}}
					/>
				))}

				{currentDuration > 0 && (
					<>
						<div ref={maskRef} className={styles.playbackMask} />
						<div ref={cursorRef} className={styles.playbackCursor} />
					</>
				)}
			</section>
		</Card>
	);
};
