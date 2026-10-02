/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/amll-dev/amll-ttml-tool/blob/main/LICENSE
 */

import { useAtomValue } from "jotai";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { getSynchronizableUnits } from "$/modules/lyric-editor/utils/lyric-states.ts";
import { lyricLinesAtom } from "$/states/main.ts";
import type { LyricLine } from "$/types/ttml.ts";
import styles from "./index.module.css";

/** 进度环的几何参数，改这里的时候记得 CSS 里的 dasharray 是按周长算的。 */
const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** 0% 时的色相（红）和 100% 时的色相（绿），中间会经过琥珀色。 */
const HUE_EMPTY = 4;
const HUE_FULL = 149;

const ringColor = (ratio: number) => {
	const clamped = Math.min(1, Math.max(0, ratio));
	const hue = HUE_EMPTY + (HUE_FULL - HUE_EMPTY) * clamped;
	return `hsl(${hue.toFixed(1)} 85% 55%)`;
};

/**
 * 判断一个可打轴单位有没有打过轴。
 *
 * 编辑器里「没打过轴」的唯一表示就是起止时间都是 0 —— 类型上没有专门的
 * 布尔字段，各处（同步按键、频谱图补时间轴）都是这么判的。
 */
const hasTiming = (unit: { startTime: number; endTime: number }) =>
	unit.startTime !== 0 || unit.endTime !== 0;

interface SyncStats {
	totalWords: number;
	syncedWords: number;
	totalLines: number;
	syncedLines: number;
	ratio: number;
}

function computeSyncStats(lines: LyricLine[]): SyncStats {
	let totalWords = 0;
	let syncedWords = 0;
	let totalLines = 0;
	let syncedLines = 0;

	for (const line of lines) {
		// 标记为「忽略打轴」的行（背景人声等）本来就不参与打轴，不能算进分母
		if (line.ignoreSync) continue;

		const units = getSynchronizableUnits(line);
		if (units.length === 0) continue;

		totalLines++;
		let syncedInLine = 0;

		for (const unit of units) {
			totalWords++;
			// 带音节（ruby）的词按音节计时，所以要看 rubyWord 而不是 word
			if (hasTiming(unit.rubyWord ?? unit.word)) {
				syncedWords++;
				syncedInLine++;
			}
		}

		if (syncedInLine === units.length && hasTiming(line)) {
			syncedLines++;
		}
	}

	return {
		totalWords,
		syncedWords,
		totalLines,
		syncedLines,
		ratio: totalWords === 0 ? 0 : syncedWords / totalWords,
	};
}

/** 庆祝动画的总时长，和 CSS 里 halo / spark 的时长加延迟对齐。 */
const CELEBRATION_MS = 1800;
const SPARK_COUNT = 12;
/** 预先算好每一颗火星的角度和延迟，省得每帧在渲染里算。 */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => ({
	angle: `${(360 / SPARK_COUNT) * i}deg`,
	delay: `${0.05 + (i % 4) * 0.05}s`,
}));

export const StatsBar = () => {
	const { t } = useTranslation();
	const lyric = useAtomValue(lyricLinesAtom);
	const stats = useMemo(
		() => computeSyncStats(lyric.lyricLines),
		[lyric.lyricLines],
	);

	const complete =
		stats.totalWords > 0 && stats.syncedWords === stats.totalWords;

	// 只在「从未完成」变成「完成」的那一刻放动画。
	// 打开一个已经打完轴的文件不应该自动庆祝。
	const [celebrating, setCelebrating] = useState(false);
	const wasComplete = useRef(complete);
	useEffect(() => {
		const justFinished = complete && !wasComplete.current;
		wasComplete.current = complete;
		if (!justFinished) return;
		setCelebrating(true);
		const timer = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
		return () => clearTimeout(timer);
	}, [complete]);

	if (stats.totalWords === 0) return null;

	const percent = Math.round(stats.ratio * 100);
	const color = ringColor(stats.ratio);

	return (
		<div className={styles.bar}>
			<div
				className={styles.ringWrap}
				data-complete={complete}
				data-celebrate={celebrating}
				style={{ "--ring-color": color } as CSSProperties}
			>
				{/* 三层扩散光环 + 迸开的小点，只有在刚好打完的那一刻才动 */}
				{[0, 1, 2].map((i) => (
					<span
						key={`halo-${i}`}
						className={styles.halo}
						style={{ "--delay": `${i * 0.14}s` } as CSSProperties}
					/>
				))}
				{SPARKS.map((spark) => (
					<span
						key={spark.angle}
						className={styles.spark}
						style={
							{
								"--angle": spark.angle,
								"--delay": spark.delay,
							} as CSSProperties
						}
					/>
				))}
				<svg
					className={styles.ring}
					viewBox="0 0 40 40"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={stats.totalWords}
					aria-valuenow={stats.syncedWords}
					aria-label={t(
						"statsBar.ariaLabel",
						"{synced} of {total} words synced",
						{ synced: stats.syncedWords, total: stats.totalWords },
					)}
				>
					<title>
						{t("statsBar.ariaLabel", "{synced} of {total} words synced", {
							synced: stats.syncedWords,
							total: stats.totalWords,
						})}
					</title>
					<circle
						className={styles.ringTrack}
						cx="20"
						cy="20"
						r={RING_RADIUS}
					/>
					<circle
						className={styles.ringProgress}
						cx="20"
						cy="20"
						r={RING_RADIUS}
						strokeDasharray={RING_CIRCUMFERENCE}
						strokeDashoffset={RING_CIRCUMFERENCE * (1 - stats.ratio)}
						transform="rotate(-90 20 20)"
					/>
					{/* 打完之后有一小段亮光绕着环转，当作「已完成」的常驻提示 */}
					{complete && (
						<circle
							className={styles.ringSheen}
							cx="20"
							cy="20"
							r={RING_RADIUS}
							transform="rotate(-90 20 20)"
						/>
					)}
				</svg>
				<span className={styles.ringValue}>{percent}</span>
			</div>

			<div className={styles.stat}>
				<span className={styles.statLabel}>{t("statsBar.words", "Words")}</span>
				<span className={styles.statValue}>
					{stats.syncedWords}
					<span className={styles.statTotal}>/{stats.totalWords}</span>
				</span>
			</div>

			<div className={styles.stat}>
				<span className={styles.statLabel}>{t("statsBar.lines", "Lines")}</span>
				<span className={styles.statValue}>
					{stats.syncedLines}
					<span className={styles.statTotal}>/{stats.totalLines}</span>
				</span>
			</div>

			{complete && (
				<span className={styles.completeNote}>
					{t("statsBar.allSynced", "All words synced")}
				</span>
			)}
		</div>
	);
};

export default StatsBar;
