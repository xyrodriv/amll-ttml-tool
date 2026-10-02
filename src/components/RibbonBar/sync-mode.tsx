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

import { useCurrentLocation } from "$/modules/lyric-editor/utils/lyric-states.ts";
import {
	displayRomanizationInSyncAtom,
	highlightActiveWordAtom,
	highlightErrorsAtom,
	showSyncedWordMarkersAtom,
	showTimestampsAtom,
	showWordRomanizationInputAtom,
} from "$/modules/settings/states/index.ts";
import {
	autoAdvanceOnMarkBeginAtom,
	autoClosePrevAcrossLinesAtom,
	autoClosePrevOnMarkBeginAtom,
	currentEmptyBeatAtom,
	nudgeStepMsAtom,
	showSpicySyncPanelAtom,
	showTouchSyncPanelAtom,
	syncTimeOffsetAtom,
	visualizeTimestampUpdateAtom,
} from "$/modules/settings/states/sync.ts";
import {
	keySyncEndAtom,
	keySyncNextAtom,
	keySyncStartAtom,
	keyNudgeWordBackwardAtom,
	keyNudgeWordForwardAtom,
} from "$/states/keybindings.ts";
import { bgLyricIgnoreSyncAtom, lyricLinesAtom, tapModeAtom } from "$/states/main.ts";
import {
	Button,
	Checkbox,
	Flex,
	Grid,
	Slider,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { KeyBinding } from "../KeyBinding/index.tsx";
import { AutoSyllableToggle } from "./auto-syllable";
import { RibbonFrame, RibbonSection } from "./common";
import { TimeShiftSection } from "./time-shift";

const EmptyBeatField = () => {
	const [currentEmptyBeat, setCurrentEmptyBeat] = useAtom(currentEmptyBeatAtom);
	const currentWordEmptyBeat = useCurrentLocation()?.word.emptyBeat || 0;
	const { t } = useTranslation();

	return (
		<>
			<Text wrap="nowrap" size="1">
				{t("ribbonBar.syncMode.currentEmptyBeat", "当前空拍")}
			</Text>
			<Slider
				value={[currentEmptyBeat]}
				onValueChange={(v) => setCurrentEmptyBeat(v[0])}
				min={0}
				max={currentWordEmptyBeat}
				step={1}
				disabled={currentWordEmptyBeat === 0}
			/>
			<div />
			<Text wrap="nowrap" align="center" size="1">
				{currentEmptyBeat} / {currentWordEmptyBeat}
			</Text>
		</>
	);
};

export const SyncModeRibbonBar: FC = forwardRef<HTMLDivElement>(
	(_props, ref) => {
		const [visualizeTimestampUpdate, setVisualizeTimestampUpdate] = useAtom(
			visualizeTimestampUpdateAtom,
		);
		const [showTouchSyncPanel, setShowTouchSyncPanel] = useAtom(
			showTouchSyncPanelAtom,
		);
		const [showTimestamps, setShowTimestamps] = useAtom(showTimestampsAtom);
		const [highlightErrors, setHighlightErrors] = useAtom(highlightErrorsAtom);
		const [highlightActiveWord, setHighlightActiveWord] = useAtom(
			highlightActiveWordAtom,
		);
		const [showSyncedWordMarkers, setShowSyncedWordMarkers] = useAtom(
			showSyncedWordMarkersAtom,
		);
		const [displayRomanizationInSync, setdisplayRomanizationInSync] = useAtom(
			displayRomanizationInSyncAtom,
		);
		const [bgLyricIgnoreSync, setBgLyricIgnoreSync] = useAtom(
			bgLyricIgnoreSyncAtom,
		);
		const [autoClosePrevOnMarkBegin, setAutoClosePrevOnMarkBegin] = useAtom(
			autoClosePrevOnMarkBeginAtom,
		);
		const tapMode = useAtomValue(tapModeAtom);
		const [showSpicySyncPanel, setShowSpicySyncPanel] = useAtom(
			showSpicySyncPanelAtom,
		);
		const [autoClosePrevAcrossLines, setAutoClosePrevAcrossLines] = useAtom(
			autoClosePrevAcrossLinesAtom,
		);
		const [autoAdvanceOnMarkBegin, setAutoAdvanceOnMarkBegin] = useAtom(
			autoAdvanceOnMarkBeginAtom,
		);
		// Tap 模式强制打开这两个开关，但不动用户存下来的值 —— 这里算的是
		// 「实际生效状态」，免得界面显示「关」而行为其实是「开」
		const closePrevEffective = tapMode || autoClosePrevOnMarkBegin;
		const advanceEffective =
			tapMode || (closePrevEffective && autoAdvanceOnMarkBegin);
		const editLyricLines = useSetImmerAtom(lyricLinesAtom);
		const showWordRomanizationInput = useAtomValue(
			showWordRomanizationInputAtom,
		);
		const [syncTimeOffset, setSyncTimeOffset] = useAtom(syncTimeOffsetAtom);
		const [nudgeStepMs, setNudgeStepMs] = useAtom(nudgeStepMsAtom);
		const { t } = useTranslation();

		return (
			<RibbonFrame ref={ref}>
				<RibbonSection
					label={t("ribbonBar.syncMode.currentEmptyBeat", "当前空拍")}
				>
					<Grid columns="0fr 4em" gap="4" gapY="1" flexGrow="1" align="center">
						<EmptyBeatField />
					</Grid>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.syncMode.syncAdjustment", "打轴调整")}
				>
					<Grid columns="0fr 0fr" gap="4" gapY="1" flexGrow="1" align="center">
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.timeOffset", "时间戳位移")}
						</Text>
						<TextField.Root
							type="number"
							step={1}
							size="1"
							style={{
								width: "8em",
							}}
							value={syncTimeOffset}
							onChange={(e) => setSyncTimeOffset(e.target.valueAsNumber)}
						>
							<TextField.Slot />
							<TextField.Slot>ms</TextField.Slot>
						</TextField.Root>
						<EmptyBeatField />
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.nudgeStep", "微调步长")}
						</Text>
						<TextField.Root
							type="number"
							step={1}
							min={1}
							size="1"
							style={{
								width: "8em",
							}}
							value={nudgeStepMs}
							onChange={(e) => {
								const next = e.target.valueAsNumber;
								setNudgeStepMs(
									Number.isFinite(next) && next > 0 ? Math.round(next) : 1,
								);
							}}
						>
							<TextField.Slot />
							<TextField.Slot>ms</TextField.Slot>
						</TextField.Root>
					</Grid>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.syncMode.assistSettings", "辅助设置")}
				>
					<Grid columns="0fr 0fr" gap="2" gapY="1" flexGrow="1" align="center">
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.showTimestampUpdate", "呈现时间戳更新")}
						</Text>
						<Checkbox
							checked={visualizeTimestampUpdate}
							onCheckedChange={(v) => setVisualizeTimestampUpdate(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.touchSyncPanel", "触控打轴辅助面板")}
						</Text>
						<Checkbox
							checked={showTouchSyncPanel}
							onCheckedChange={(v) => setShowTouchSyncPanel(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.bgLyricIgnoreSync", "背景歌词忽略打轴")}
						</Text>
						<Checkbox
							checked={bgLyricIgnoreSync}
							onCheckedChange={(v) => {
								const next = !!v;
								setBgLyricIgnoreSync(next);
								editLyricLines((state) => {
									for (const line of state.lyricLines) {
										if (line.isBG) {
											line.ignoreSync = next;
										}
									}
									return state;
								});
							}}
						/>
						<Text
							wrap="nowrap"
							size="1"
							title={
								tapMode
									? t(
											"ribbonBar.syncMode.lockedInTapMode",
											"敲击模式下强制开启",
										)
									: undefined
							}
						>
							{t(
								"ribbonBar.syncMode.autoClosePrevOnMarkBegin",
								"起始轴自动闭合上一字",
							)}
						</Text>
						<Checkbox
							disabled={tapMode}
							checked={closePrevEffective}
							onCheckedChange={(v) =>
								setAutoClosePrevOnMarkBegin(!!v)
							}
						/>
						<Text
							wrap="nowrap"
							size="1"
							color={closePrevEffective ? undefined : "gray"}
							title={
								closePrevEffective
									? t(
										"ribbonBar.syncMode.autoClosePrevAcrossLinesHint",
										"在下一行首个字按起始轴时，同时闭合上一行最后一个字",
									)
									: t(
											"ribbonBar.syncMode.autoAdvanceOnMarkBeginHint",
											"需先开启「起始轴自动闭合上一字」",
										)
							}
						>
							{t(
								"ribbonBar.syncMode.autoClosePrevAcrossLines",
								"换行时也闭合上一行末字",
							)}
						</Text>
						<Checkbox
							disabled={!closePrevEffective}
							checked={closePrevEffective && autoClosePrevAcrossLines}
							onCheckedChange={(v) => setAutoClosePrevAcrossLines(!!v)}
						/>
						<Text
							wrap="nowrap"
							size="1"
							color={closePrevEffective ? undefined : "gray"}
							title={
								tapMode
									? t(
											"ribbonBar.syncMode.lockedInTapMode",
											"敲击模式下强制开启",
										)
									: closePrevEffective
										? undefined
										: t(
												"ribbonBar.syncMode.autoAdvanceOnMarkBeginHint",
												"需先开启「起始轴自动闭合上一字」",
											)
							}
						>
							{t(
								"ribbonBar.syncMode.autoAdvanceOnMarkBegin",
								"起始轴后自动跳下一字",
							)}
						</Text>
						<Checkbox
							disabled={tapMode || !closePrevEffective}
							checked={advanceEffective}
							onCheckedChange={(v) => setAutoAdvanceOnMarkBegin(!!v)}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.syncMode.displayOptions", "显示选项")}
				>
					<Grid columns="0fr 0fr" gap="2" gapY="1" flexGrow="1" align="center">
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.showTimestamps", "显示时间戳")}
						</Text>
						<Checkbox
							checked={showTimestamps}
							onCheckedChange={(v) => setShowTimestamps(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.highlightActiveWord", "高亮当前音节")}
						</Text>
						<Checkbox
							checked={highlightActiveWord}
							onCheckedChange={(v) => setHighlightActiveWord(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t("ribbonBar.syncMode.highlightErrors", "高亮错误")}
						</Text>
						<Checkbox
							checked={highlightErrors}
							onCheckedChange={(v) => setHighlightErrors(!!v)}
						/>
						<Text wrap="nowrap" size="1">
							{t(
								"ribbonBar.syncMode.showSyncedWordMarkers",
								"波形已打轴标记",
							)}
						</Text>
						<Checkbox
							checked={showSyncedWordMarkers}
							onCheckedChange={(v) => setShowSyncedWordMarkers(!!v)}
						/>
						{showWordRomanizationInput && (
							<>
								<Text wrap="nowrap" size="1">
									{t(
										"ribbonBar.syncMode.showPerWordRomanization",
										"显示逐字音译",
									)}
								</Text>
								<Checkbox
									checked={displayRomanizationInSync}
									onCheckedChange={(v) => setdisplayRomanizationInSync(!!v)}
								/>
							</>
						)}
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.autoSyllable.title", "音节")}>
					<AutoSyllableToggle />
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.syncMode.keyBindingReference", "打轴键位速查")}
				>
					<Flex gap="4">
						<Grid
							columns="0fr 0fr"
							gap="4"
							gapY="1"
							flexGrow="1"
							align="center"
							justify="center"
						>
							<Text wrap="nowrap" size="1">
								{t("ribbonBar.syncMode.startSync", "起始轴")}
							</Text>
							<KeyBinding kbdAtom={keySyncStartAtom} />
							<Text wrap="nowrap" size="1">
								{t("ribbonBar.syncMode.continuousSync", "连续轴")}
							</Text>
							<KeyBinding kbdAtom={keySyncNextAtom} />
							<Text wrap="nowrap" size="1">
								{t("ribbonBar.syncMode.endSync", "结束轴")}
							</Text>
							<KeyBinding kbdAtom={keySyncEndAtom} />
							<Text wrap="nowrap" size="1">
								{t("ribbonBar.syncMode.nudgeBackward", "前移所选")}
							</Text>
							<KeyBinding kbdAtom={keyNudgeWordBackwardAtom} />
							<Text wrap="nowrap" size="1">
								{t("ribbonBar.syncMode.nudgeForward", "后移所选")}
							</Text>
						<KeyBinding kbdAtom={keyNudgeWordForwardAtom} />
					</Grid>
				</Flex>
			</RibbonSection>
			<TimeShiftSection />
			{/* marginLeft: auto 把这一节顶到 Ribbon 最右边（Ribbon 是横向滚动的 flex） */}
			<Flex style={{ marginLeft: "auto" }} flexShrink="0">
				<RibbonSection
					label={t("ribbonBar.syncMode.spicyPreview", "Spicy 预览")}
				>
					<Button
						size="1"
						variant={showSpicySyncPanel ? "solid" : "soft"}
						onClick={() => setShowSpicySyncPanel(!showSpicySyncPanel)}
					>
						{t(
							"ribbonBar.syncMode.toggleSpicyLyrics",
							"Toggle Spicy Lyrics",
						)}
					</Button>
				</RibbonSection>
			</Flex>
		</RibbonFrame>
		);
	},
);

export default SyncModeRibbonBar;
