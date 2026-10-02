import { useAtomValue } from "jotai";
import { useCallback, useRef, useState } from "react";
import { msToTimestamp } from "$/utils/timestamp";
import { currentDurationAtom } from "../states";

/**
 * @param viewStartSec 可见窗口的起始时间（秒），缩放后非 0
 * @param viewSpanSec  可见窗口覆盖的时长（秒）；不传则视为展示整条音频
 */
export const useHoverGuide = (
	sliderWidthPx: number,
	viewStartSec = 0,
	viewSpanSec?: number,
) => {
	const currentDuration = useAtomValue(currentDurationAtom);
	const [hoverState, setHoverState] = useState({
		x: 0,
		timeStr: "0:00",
		isNearRight: false,
		isVisible: false,
	});

	const isDraggingRef = useRef(false);

	const handleContainerMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (isDraggingRef.current || currentDuration <= 0 || sliderWidthPx <= 0) {
				setHoverState((prev) => ({ ...prev, isVisible: false }));
				return;
			}

			const target = e.target as HTMLElement;
			if (target.closest("[data-drag-type]")) {
				setHoverState((prev) => ({ ...prev, isVisible: false }));
				return;
			}

			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const clampedX = Math.max(0, Math.min(x, rect.width));
			const isNearRight = rect.width - clampedX < 80;
			const progress = clampedX / rect.width;
			// 缩放后波形只展示可见窗口，需要把窗口偏移算进去
			const timeMs =
				viewSpanSec === undefined
					? progress * currentDuration
					: (viewStartSec + progress * viewSpanSec) * 1000;

			setHoverState({
				x: clampedX,
				timeStr: msToTimestamp(timeMs),
				isNearRight,
				isVisible: true,
			});
		},
		[currentDuration, sliderWidthPx, viewStartSec, viewSpanSec],
	);

	const handleContainerMouseLeave = useCallback(() => {
		setHoverState((prev) => ({ ...prev, isVisible: false }));
	}, []);

	return {
		hoverState,
		handleContainerMouseMove,
		handleContainerMouseLeave,
		isDraggingRef,
	};
};
