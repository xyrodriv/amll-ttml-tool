import {
	ArrowLeft16Regular,
	ArrowResetRegular,
	Dismiss16Regular,
	ErrorCircle16Regular,
	Info16Regular,
	Timer16Regular,
} from "@fluentui/react-icons";
import {
	Box,
	Button,
	Callout,
	Card,
	Checkbox,
	Flex,
	IconButton,
	Slider,
	Text,
	Tooltip,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	type FC,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { KeyBinding } from "$/components/KeyBinding";
import { useBpmControl, useBpmTapEngine } from "$/modules/audio/hooks";
import {
	audioEngineStateAtom,
	bpmScaleAtom,
	bpmStateAtom,
	hasSeenTapWindowTipAtom,
	metronomeEnabledAtom,
	metronomeVolumeAtom,
} from "$/modules/audio/states";
import { showBeatLinesAtom } from "$/modules/spectrogram/states";
import { keySyncNextAtom } from "$/states/keybindings";
import { useKeyBindingAtom } from "$/utils/keybindings";

function formatCalculationTime(timeMs: number): string {
	if (timeMs < 1000) {
		return `${Math.round(timeMs)} ms`;
	}
	return `${(timeMs / 1000).toFixed(2)} s`;
}

export const BpmPanel: FC = () => {
	const { t } = useTranslation();
	const followRateCheckboxId = useId();
	const showBeatLinesCheckboxId = useId();
	const metronomeCheckboxId = useId();
	const {
		bpmState,
		originalBpm,
		currentBpm,
		playbackRate,
		followPlaybackRate,
		setFollowPlaybackRate,
		isAdjusted,
		halveBpm,
		doubleBpm,
		resetBpm: rawResetBpm,
	} = useBpmControl();

	const {
		setTapMode,
		isKeyTapMode,
		isSpectrogramTapMode,
		tapTimes,
		triggerTap,
		resetTapTimes,
		isHighlighted,
	} = useBpmTapEngine();

	const setBpmScale = useSetAtom(bpmScaleAtom);

	const [bpmDraft, setBpmDraft] = useState<string | null>(null);
	const bpmInputRef = useRef<HTMLInputElement>(null);

	const effectiveRate = followPlaybackRate ? playbackRate : 1;

	const startEditBpm = useCallback(() => {
		if (currentBpm === null) return;
		setBpmDraft(String(currentBpm));
	}, [currentBpm]);

	const cancelEditBpm = useCallback(() => setBpmDraft(null), []);

	const commitBpm = useCallback(() => {
		if (
			bpmDraft === null ||
			currentBpm === null ||
			originalBpm === null ||
			originalBpm <= 0 ||
			effectiveRate <= 0
		) {
			setBpmDraft(null);
			return;
		}
		const parsed = Number(bpmDraft);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setBpmDraft(null);
			return;
		}
		// 1–999 is a sane range for any real piece of music; we can tighten later
		// if anyone ever asks for 1000+ BPM. Floor at 1 so the scale stays finite.
		const target = Math.max(1, Math.min(999, Math.round(parsed)));
		setBpmScale(target / (originalBpm * effectiveRate));
		setBpmDraft(null);
	}, [bpmDraft, currentBpm, originalBpm, effectiveRate, setBpmScale]);

	useEffect(() => {
		if (bpmDraft !== null && bpmInputRef.current) {
			bpmInputRef.current.focus();
			bpmInputRef.current.select();
		}
	}, [bpmDraft]);

	const setBpmState = useSetAtom(bpmStateAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const [showBeatLines, setShowBeatLines] = useAtom(showBeatLinesAtom);
	const [metronomeEnabled, setMetronomeEnabled] = useAtom(metronomeEnabledAtom);
	const [metronomeVolume, setMetronomeVolume] = useAtom(metronomeVolumeAtom);
	const [hasSeenTapWindowTip, setHasSeenTapWindowTip] = useAtom(
		hasSeenTapWindowTipAtom,
	);

	const audioLoaded =
		engineState === "ready" ||
		engineState === "playing" ||
		engineState === "paused";

	const initialBpmRef = useRef<typeof bpmState | null>(null);
	if (
		bpmState.status === "completed" &&
		initialBpmRef.current === null &&
		bpmState.calculationTime > 0
	) {
		initialBpmRef.current = bpmState;
	}

	const handleResetBpm = useCallback(() => {
		rawResetBpm();
		resetTapTimes();
		if (initialBpmRef.current) {
			setBpmState(initialBpmRef.current);
		}
	}, [rawResetBpm, resetTapTimes, setBpmState]);

	useKeyBindingAtom(
		keySyncNextAtom,
		(evt) => {
			if (!isKeyTapMode) return;
			triggerTap(undefined, evt.downTimeOffset);
		},
		[isKeyTapMode, triggerTap],
	);

	let bpmValueText = "--";
	let durationText = "--";

	if (bpmState.status === "completed") {
		bpmValueText = `${currentBpm ?? Math.round(bpmState.result.bpm)}`;
		durationText = formatCalculationTime(bpmState.calculationTime);
	} else if (bpmState.status === "analyzing") {
		bpmValueText = t("sidebar.bpm.analyzing", "正在分析");
	}

	const isAnalyzing = bpmState.status === "analyzing";
	const isCompleted = bpmState.status === "completed";
	const isModified =
		isAdjusted ||
		tapTimes.length > 0 ||
		(isCompleted && bpmState.calculationTime === 0);

	return (
		<Box p="4">
			<Flex direction="column" gap="4">
				<Flex
					direction="column"
					align="center"
					gap="1"
					style={{ position: "relative", width: "100%" }}
				>
					<Text size="1" color="gray" weight="medium">
						BPM
					</Text>

					<Flex
						align="center"
						justify="center"
						gap="5"
						style={{ width: "100%" }}
					>
						<Tooltip content={t("sidebar.bpm.halve", "减半 BPM")}>
							<Button
								size="2"
								variant="soft"
								color="gray"
								disabled={!isCompleted}
								onClick={halveBpm}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								÷2
							</Button>
						</Tooltip>

						{bpmDraft !== null ? (
							<input
								ref={bpmInputRef}
								type="number"
								inputMode="numeric"
								min={1}
								max={999}
								value={bpmDraft}
								onChange={(event) => setBpmDraft(event.target.value)}
								onBlur={commitBpm}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitBpm();
									} else if (event.key === "Escape") {
										event.preventDefault();
										cancelEditBpm();
									}
								}}
								aria-label={t("sidebar.bpm.editLabel", "BPM 值")}
								style={{
									width: "5.5em",
									fontFamily: "var(--default-font-family-mono)",
									fontVariantNumeric: "tabular-nums",
									fontSize:
										"var(--font-size-" +
										(isAnalyzing ? "6" : "8") +
										")",
									fontWeight: "bold",
									color: "var(--accent-12)",
									textAlign: "center",
									background: "transparent",
									border: "1px solid var(--accent-9)",
									borderRadius: "var(--radius-2, 6px)",
									padding: "2px 4px",
									outline: "none",
								}}
							/>
						) : (
							<Tooltip content={t("sidebar.bpm.clickToEdit", "点击输入 BPM")}>
								<Text
									size={isAnalyzing ? "6" : "8"}
									weight="bold"
									role="button"
									tabIndex={isCompleted ? 0 : -1}
									onClick={isCompleted ? startEditBpm : undefined}
									onKeyDown={(event) => {
										if (
											isCompleted &&
											(event.key === "Enter" || event.key === " ")
										) {
											event.preventDefault();
											startEditBpm();
										}
									}}
									style={{
										fontFamily: "var(--default-font-family-mono)",
										fontVariantNumeric: "tabular-nums",
										cursor: isCompleted ? "text" : "default",
										userSelect: "none",
									}}
								>
									{bpmValueText}
								</Text>
							</Tooltip>
						)}

						<Tooltip content={t("sidebar.bpm.double", "加倍 BPM")}>
							<Button
								size="2"
								variant="soft"
								color="gray"
								disabled={!isCompleted}
								onClick={doubleBpm}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								×2
							</Button>
						</Tooltip>
					</Flex>

					{isCompleted && isModified && (
						<Tooltip content={t("sidebar.bpm.reset", "重置 BPM")}>
							<IconButton
								size="2"
								variant="ghost"
								color="gray"
								onClick={handleResetBpm}
								style={{
									position: "absolute",
									right: 0,
									top: "100%",
									transform: "translateY(-50%)",
								}}
							>
								<ArrowResetRegular style={{ fontSize: 18 }} />
							</IconButton>
						</Tooltip>
					)}
				</Flex>

				<Flex align="center" justify="center" gap="2">
					<Timer16Regular style={{ color: "var(--gray-10)" }} />
					<Text
						size="2"
						color="gray"
						style={{ fontFamily: "var(--default-font-family-mono)" }}
					>
						{durationText}
					</Text>
				</Flex>

				{bpmState.status === "error" && (
					<Callout.Root color="red" size="1">
						<Callout.Icon>
							<ErrorCircle16Regular />
						</Callout.Icon>
						<Callout.Text>{bpmState.error}</Callout.Text>
					</Callout.Root>
				)}

				<Flex align="center" gap="2" mt="2">
					<Checkbox
						id={followRateCheckboxId}
						checked={followPlaybackRate}
						onCheckedChange={(checked) =>
							setFollowPlaybackRate(Boolean(checked))
						}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={followRateCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.followPlaybackRate", "跟随音频播放倍速")}
						</label>
					</Text>
				</Flex>

				<Flex align="center" gap="2">
					<Checkbox
						id={showBeatLinesCheckboxId}
						checked={showBeatLines}
						onCheckedChange={(checked) => setShowBeatLines(Boolean(checked))}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={showBeatLinesCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.showBeatLines", "在频谱图上显示拍子")}
						</label>
					</Text>
				</Flex>

				<Flex align="center" gap="2">
					<Checkbox
						id={metronomeCheckboxId}
						checked={metronomeEnabled}
						onCheckedChange={(checked) =>
							setMetronomeEnabled(Boolean(checked))
						}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={metronomeCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.metronome", "节拍器")}
						</label>
					</Text>
				</Flex>

				{metronomeEnabled && (
					<Flex align="center" gap="3" pl="1">
						<Text size="1" color="gray" style={{ whiteSpace: "nowrap" }}>
							{t("sidebar.bpm.metronomeVolume", "节拍器音量")}
						</Text>
						<Slider
							size="1"
							value={[metronomeVolume]}
							min={0}
							max={1}
							step={0.01}
							onValueChange={([value]) => setMetronomeVolume(value)}
							aria-label={t("sidebar.bpm.metronomeVolume", "节拍器音量")}
							style={{ flex: 1 }}
						/>
						<Text
							size="1"
							color="gray"
							style={{
								fontFamily: "var(--default-font-family-mono)",
								fontVariantNumeric: "tabular-nums",
								minWidth: "2.5em",
								textAlign: "right",
							}}
						>
							{Math.round(metronomeVolume * 100)}
						</Text>
					</Flex>
				)}

				{metronomeEnabled && (
					<Text
						size="1"
						color="gray"
						style={{ paddingLeft: "var(--space-1)" }}
					>
						{t(
							"sidebar.bpm.metronomeOnlyWhenPlaying",
							"仅在音轨播放时发声",
						)}
					</Text>
				)}

				{!hasSeenTapWindowTip && (isKeyTapMode || isSpectrogramTapMode) && (
					<Callout.Root
						color="blue"
						size="1"
						variant="soft"
						style={{
							display: "flex",
							alignItems: "center",
							paddingRight: "10px",
						}}
					>
						<Callout.Icon style={{ display: "flex", alignItems: "center" }}>
							<Info16Regular style={{ display: "block" }} />
						</Callout.Icon>

						<Callout.Text size="1" style={{ flex: 1 }}>
							{t(
								"sidebar.bpm.slidingWindowTip",
								"只会使用最近 10 次校准数据计算 BPM",
							)}
						</Callout.Text>

						<IconButton
							size="1"
							variant="ghost"
							color="gray"
							onClick={() => setHasSeenTapWindowTip(true)}
							style={{
								margin: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Dismiss16Regular />
						</IconButton>
					</Callout.Root>
				)}

				{!isKeyTapMode && !isSpectrogramTapMode && (
					<Flex direction="column" gap="2" align="start">
						<Button
							size="2"
							variant="soft"
							disabled={!audioLoaded}
							onClick={() => setTapMode("key")}
							style={{ alignSelf: "flex-start", cursor: "pointer" }}
						>
							{t("sidebar.bpm.manualCalibration", "手动打拍校准")}
						</Button>
						<Button
							size="2"
							variant="soft"
							disabled={!audioLoaded}
							onClick={() => setTapMode("spectrogram")}
							style={{ alignSelf: "flex-start", cursor: "pointer" }}
						>
							{t("sidebar.bpm.spectrogramCalibration", "使用频谱图校准")}
						</Button>
					</Flex>
				)}

				{isKeyTapMode && (
					<Card size="2">
						<Flex direction="column" gap="3" style={{ position: "relative" }}>
							<Flex align="center" justify="start">
								<IconButton
									size="1"
									variant="ghost"
									color="gray"
									onClick={() => {
										setTapMode("off");
										resetTapTimes();
									}}
									style={{
										position: "absolute",
										left: 0,
										top: 0,
										cursor: "pointer",
									}}
								>
									<ArrowLeft16Regular />
								</IconButton>

								<Flex
									align="center"
									justify="center"
									style={{
										width: "100%",
										paddingLeft: "28px",
										paddingRight: "28px",
									}}
								>
									<Text
										size="2"
										weight={isHighlighted ? "bold" : "medium"}
										onClick={() => triggerTap()}
										style={{
											textAlign: "center",
											color: isHighlighted ? "var(--accent-11)" : undefined,
											cursor: "pointer",
											userSelect: "none",
										}}
									>
										{t("sidebar.bpm.tapInstructionPrefix", "根据节拍按下 ")}
										<KeyBinding kbdAtom={keySyncNextAtom} />
										{t("sidebar.bpm.tapInstructionSuffix", " 或点击此处")}
									</Text>
								</Flex>
							</Flex>

							<Flex gap="1" style={{ width: "100%" }} justify="center">
								{Array.from({ length: 10 }).map((_, index) => (
									<Box
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 indicator bars
										key={index}
										style={{
											flex: 1,
											height: "4px",
											borderRadius: "2px",
											backgroundColor:
												index < Math.min(tapTimes.length, 10)
													? "var(--accent-9)"
													: "var(--gray-5)",
										}}
									/>
								))}
							</Flex>
						</Flex>
					</Card>
				)}

				{isSpectrogramTapMode && (
					<Card size="2">
						<Flex direction="column" gap="3" style={{ position: "relative" }}>
							<Flex align="center" justify="start">
								<IconButton
									size="1"
									variant="ghost"
									color="gray"
									onClick={() => {
										setTapMode("off");
										resetTapTimes();
									}}
									style={{
										position: "absolute",
										left: 0,
										top: 0,
										cursor: "pointer",
									}}
								>
									<ArrowLeft16Regular />
								</IconButton>

								<Flex
									align="center"
									justify="center"
									style={{
										width: "100%",
										paddingLeft: "28px",
										paddingRight: "28px",
									}}
								>
									<Text
										size="2"
										weight={isHighlighted ? "bold" : "medium"}
										style={{
											textAlign: "center",
											color: isHighlighted ? "var(--accent-11)" : undefined,
											userSelect: "none",
										}}
									>
										{t(
											"sidebar.bpm.clickOnSpectrogramToCalibrate",
											"在频谱图上点击以校准",
										)}
									</Text>
								</Flex>
							</Flex>

							<Flex gap="1" style={{ width: "100%" }} justify="center">
								{Array.from({ length: 10 }).map((_, index) => (
									<Box
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 indicator bars
										key={index}
										style={{
											flex: 1,
											height: "4px",
											borderRadius: "2px",
											backgroundColor:
												index < Math.min(tapTimes.length, 10)
													? "var(--accent-9)"
													: "var(--gray-5)",
										}}
									/>
								))}
							</Flex>
						</Flex>
					</Card>
				)}
			</Flex>
		</Box>
	);
};

export default BpmPanel;
