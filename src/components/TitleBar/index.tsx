import { SegmentedControl, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, useCallback } from "react";
import { useTranslation } from "react-i18next";
import WindowControls from "$/components/WindowControls";
import {
	keySwitchEditModeAtom,
	keySwitchPreviewModeAtom,
	keySwitchSyncModeAtom,
	keySwitchTapModeAtom,
} from "$/states/keybindings.ts";
import {
	selectedLinesAtom,
	selectedWordsAtom,
	tapModeAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main.ts";
import { useKeyBindingAtom } from "$/utils/keybindings.ts";
import { TopMenu } from "../TopMenu/index.tsx";
import styles from "./index.module.css";

/**
 * Tap 只是顶栏上的一个 Tab，不是真正的 ToolMode（见 `tapModeAtom` 的注释），
 * 所以它在 SegmentedControl 里需要一个不和 ToolMode 撞车的合成 value。
 */
const TAP_TAB_VALUE = "tap";

export const TitleBar: FC = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const [tapMode, setTapMode] = useAtom(tapModeAtom);
	const setSelectedLines = useSetImmerAtom(selectedLinesAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const { t } = useTranslation();

	// Tap 模式是打轴模式的变体，所以切走任何一个别的模式都要把它关掉
	const leaveTapMode = useCallback(() => {
		setTapMode(false);
	}, [setTapMode]);

	const onSwitchEditMode = useCallback(() => {
		leaveTapMode();
		setToolMode(ToolMode.Edit);
	}, [setToolMode, leaveTapMode]);
	const onSwitchSyncMode = useCallback(() => {
		leaveTapMode();
		setToolMode(ToolMode.Sync);
	}, [setToolMode, leaveTapMode]);
	const onSwitchPreviewMode = useCallback(() => {
		leaveTapMode();
		setToolMode(ToolMode.Preview);
	}, [setToolMode, leaveTapMode]);
	const onSwitchTapMode = useCallback(() => {
		setTapMode(true);
		setToolMode(ToolMode.Sync);
	}, [setToolMode, setTapMode]);

	const onModeChange = useCallback(
		(value: string) => {
			if (value === TAP_TAB_VALUE) {
				onSwitchTapMode();
				return;
			}
			leaveTapMode();
			setToolMode(value as ToolMode);
		},
		[onSwitchTapMode, leaveTapMode, setToolMode],
	);

	useKeyBindingAtom(keySwitchEditModeAtom, onSwitchEditMode);
	useKeyBindingAtom(keySwitchSyncModeAtom, onSwitchSyncMode);
	useKeyBindingAtom(keySwitchPreviewModeAtom, onSwitchPreviewMode);
	useKeyBindingAtom(keySwitchTapModeAtom, onSwitchTapMode);

	return (
		<WindowControls
			startChildren={<TopMenu />}
			titleChildren={
				<SegmentedControl.Root
					value={tapMode ? TAP_TAB_VALUE : toolMode}
					onValueChange={onModeChange}
					// size="1"
				>
					<SegmentedControl.Item value={ToolMode.Edit}>
						{t("topBar.modeBtns.edit", "编辑")}
					</SegmentedControl.Item>
					<SegmentedControl.Item value={ToolMode.Sync}>
						{t("topBar.modeBtns.sync", "打轴")}
					</SegmentedControl.Item>
					<SegmentedControl.Item value={TAP_TAB_VALUE}>
						{t("topBar.modeBtns.tap", "Tap")}
					</SegmentedControl.Item>
					<SegmentedControl.Item value={ToolMode.Preview}>
						{t("topBar.modeBtns.preview", "预览")}
					</SegmentedControl.Item>
				</SegmentedControl.Root>
			}
			endChildren={
				!import.meta.env.TAURI_ENV_PLATFORM && (
					<Text color="gray" wrap="nowrap" size="2" mr="2">
						<span className={styles.title}>
							{t("topBar.appName", "Apple Music-like Lyrics TTML Tool")}
						</span>
					</Text>
				)
			}
			onSpacerClicked={() => {
				setSelectedLines((o) => o.clear());
				setSelectedWords((o) => o.clear());
			}}
		/>
	);
};
