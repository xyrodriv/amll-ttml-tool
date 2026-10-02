import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
	spectrogramScrollLeftAtom,
	spectrogramZoomAtom,
} from "$/modules/spectrogram/states";
import { currentDurationAtom } from "../states";
import { clampScroll, clampZoom } from ".";

const ZOOM_STEP = 1.2;

/** 每帧向目标插值的比例，越小越“缓”，越大越“跟手” */
const LERP = 0.3;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 底部波形条的缩放 / 平移（带缓动动画）。
 * Zoom & pan for the bottom waveform strip, with eased animation.
 *
 * 坐标模型 / Coordinate model:
 *   zoom        = 每秒占用的像素数 (px per second)
 *   scrollLeft  = 可见窗口左边缘对应的像素偏移
 *   时间 -> 屏幕 x :  x = timeMs * (zoom / 1000) - scrollLeft
 *   屏幕 x -> 时间 :  t = (scrollLeft + x) / zoom
 */
export const useAudioSliderZoom = (
	containerRef: React.RefObject<HTMLDivElement | null>,
	sliderWidthPx: number,
) => {
	const currentDuration = useAtomValue(currentDurationAtom);
	const [zoom, setZoom] = useAtom(spectrogramZoomAtom);
	const [scrollLeft, setScrollLeft] = useAtom(spectrogramScrollLeftAtom);

	const durationSec = currentDuration / 1000;
	const usable = durationSec > 0 && sliderWidthPx > 0;

	const viewSpanSec = usable && zoom > 0 ? sliderWidthPx / zoom : durationSec;
	const viewStartSec = usable && zoom > 0 ? scrollLeft / zoom : 0;

	// 归一化后的可见区间，交给渲染 worker 只绘制这一段
	const viewStart = usable ? clamp01(viewStartSec / durationSec) : 0;
	const viewEnd = usable
		? Math.max(clamp01((viewStartSec + viewSpanSec) / durationSec), viewStart)
		: 1;

	const fitZoom = usable ? clampZoom(sliderWidthPx / durationSec) : zoom;

	// ---- 缓动动画 / eased animation ----
	const animRef = useRef<{ z: number; s: number } | null>(null);
	const targetRef = useRef<{ z: number; s: number } | null>(null);
	const rafRef = useRef<number | null>(null);
	const stepRef = useRef<(() => void) | null>(null);

	stepRef.current = () => {
		const anim = animRef.current;
		const target = targetRef.current;
		if (!anim || !target) {
			rafRef.current = null;
			return;
		}

		const nextZ = anim.z + (target.z - anim.z) * LERP;
		const nextS = anim.s + (target.s - anim.s) * LERP;

		const zoomSettled = Math.abs(target.z - nextZ) < 0.01;
		const scrollSettled = Math.abs(target.s - nextS) < 0.5;

		if (zoomSettled && scrollSettled) {
			animRef.current = null;
			targetRef.current = null;
			rafRef.current = null;
			setZoom(target.z);
			setScrollLeft(target.s);
			return;
		}

		animRef.current = { z: nextZ, s: nextS };
		setZoom(nextZ);
		setScrollLeft(nextS);
		rafRef.current = requestAnimationFrame(() => stepRef.current?.());
	};

	const stopAnimation = useCallback(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		animRef.current = null;
		targetRef.current = null;
	}, []);

	useEffect(() => stopAnimation, [stopAnimation]);

	/** 平滑过渡到指定的缩放 / 位置；省略的字段保持当前目标 */
	const animateTo = useCallback(
		(next?: { zoom?: number; scrollLeft?: number }) => {
			const base = animRef.current ?? { z: zoom, s: scrollLeft };
			animRef.current = base;
			targetRef.current = {
				z: next?.zoom ?? targetRef.current?.z ?? base.z,
				s: next?.scrollLeft ?? targetRef.current?.s ?? base.s,
			};

			if (rafRef.current === null) {
				rafRef.current = requestAnimationFrame(() => stepRef.current?.());
			}
		},
		[zoom, scrollLeft],
	);

	// 每次载入新的音频时，直接（无动画）展示整条波形
	const lastDurationRef = useRef(0);
	useEffect(() => {
		if (!usable || currentDuration === lastDurationRef.current) return;
		lastDurationRef.current = currentDuration;
		stopAnimation();
		setZoom(fitZoom);
		setScrollLeft(0);
	}, [usable, currentDuration, fitZoom, setZoom, setScrollLeft, stopAnimation]);

	const resetZoom = useCallback(() => {
		if (!usable) return;
		animateTo({ zoom: fitZoom, scrollLeft: 0 });
	}, [usable, fitZoom, animateTo]);

	const handleWheel = useCallback(
		(event: WheelEvent) => {
			// 滚轮只用来缩放/平移，绝不允许冒泡出去影响播放头或页面滚动
			event.preventDefault();
			event.stopPropagation();

			if (!usable || !containerRef.current) return;

			const rect = containerRef.current.getBoundingClientRect();
			let mouseX = event.clientX - rect.left;
			if (mouseX < 0) mouseX = 0;
			if (mouseX > sliderWidthPx) mouseX = sliderWidthPx;

			// Shift + 滚轮 = 横向平移
			if (event.shiftKey) {
				const delta =
					Math.abs(event.deltaX) > Math.abs(event.deltaY)
						? event.deltaX
						: event.deltaY;
				if (delta === 0) return;
				animateTo({
					scrollLeft: clampScroll(
						(animRef.current?.s ?? scrollLeft) + delta,
						animRef.current?.z ?? zoom,
						currentDuration,
						sliderWidthPx,
					),
				});
				return;
			}

			// 滚轮 = 以光标为中心缩放
			if (event.deltaY === 0) return;

			const currentZoom = animRef.current?.z ?? zoom;
			const currentScroll = animRef.current?.s ?? scrollLeft;
			const timeAtCursor = (currentScroll + mouseX) / currentZoom;
			const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			const newZoom = clampZoom(currentZoom * factor);
			if (newZoom === currentZoom) return;

			animateTo({
				zoom: newZoom,
				scrollLeft: clampScroll(
					timeAtCursor * newZoom - mouseX,
					newZoom,
					currentDuration,
					sliderWidthPx,
				),
			});
		},
		[
			usable,
			containerRef,
			sliderWidthPx,
			scrollLeft,
			zoom,
			currentDuration,
			animateTo,
		],
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, [containerRef, handleWheel]);

	return {
		zoom,
		scrollLeft,
		setScrollLeft,
		viewStart,
		viewEnd,
		viewStartSec,
		viewSpanSec,
		/** 平滑过渡到指定视图 */
		animateTo,
		/** 立刻中断缓动动画，交给直接拖拽接管 */
		stopAnimation,
		resetZoom,
	};
};
