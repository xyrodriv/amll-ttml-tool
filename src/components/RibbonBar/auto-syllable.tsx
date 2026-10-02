/*
 * 「自动拆分英文音节」开关
 *
 * 打开：把全篇可拆的英文单词拆成 word.ruby[] 音节（如 research -> re/search）
 * 关闭：只还原本开关生成的音节，手动录入的 ruby 不受影响
 * 两个方向都是一次可撤销的操作（Ctrl+Z）
 */

import { Checkbox, Flex, Text, Tooltip } from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	autoSplitEnglishSyllablesAtom,
	autoSplitSyllablesLangAtom,
} from "$/modules/segmentation/states";
import type { HyphenatorFunc } from "$/modules/segmentation/types";
import { loadHyphenator } from "$/modules/segmentation/utils/hyphen-loader";
import {
	applyAutoSyllableSplit,
	countAutoSplitWords,
	revertAutoSyllableSplit,
} from "$/modules/segmentation/utils/syllable-split";
import { lyricLinesAtom } from "$/states/main.ts";

export const AutoSyllableToggle: FC = () => {
	const [enabled, setEnabled] = useAtom(autoSplitEnglishSyllablesAtom);
	const [lang] = useAtom(autoSplitSyllablesLangAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const editLyricLines = useSetImmerAtom(lyricLinesAtom);
	const [hyphenator, setHyphenator] = useState<HyphenatorFunc>();
	const [busy, setBusy] = useState(false);
	const { t } = useTranslation();

	useEffect(() => {
		let mounted = true;
		void loadHyphenator(lang).then((fn) => {
			if (mounted && fn) setHyphenator(() => fn);
		});
		return () => {
			mounted = false;
		};
	}, [lang]);

	const splitCount = countAutoSplitWords(lyricLines.lyricLines);

	const handleToggle = useCallback(
		async (next: boolean) => {
			setBusy(true);
			try {
				let fn = hyphenator;
				if (!fn) {
					fn = (await loadHyphenator(lang)) ?? undefined;
					if (fn) setHyphenator(() => fn);
				}
				if (!fn) return;

				setEnabled(next);
				editLyricLines((state) => {
					if (next) {
						applyAutoSyllableSplit(state.lyricLines, fn);
					} else {
						revertAutoSyllableSplit(state.lyricLines);
					}
					return state;
				});
			} finally {
				setBusy(false);
			}
		},
		[hyphenator, lang, setEnabled, editLyricLines],
	);

	return (
		<Flex direction="column" gap="1">
			<Flex align="center" gap="2">
				<Checkbox
					checked={enabled}
					disabled={busy}
					onCheckedChange={(v) => void handleToggle(!!v)}
				/>
				<Text wrap="nowrap" size="1">
					{t("ribbonBar.autoSyllable.enable", "自动拆分英文音节")}
				</Text>
			</Flex>
			<Tooltip
				content={t(
					"ribbonBar.autoSyllable.hint",
					"把英文单词拆成 word.ruby[] 音节，可用 Ctrl+Z 撤销",
				)}
			>
				<Text wrap="nowrap" size="1" color="gray">
					{t("ribbonBar.autoSyllable.splitCount", "已拆 {{count}} 词", {
						count: splitCount,
					})}
				</Text>
			</Tooltip>
		</Flex>
	);
};

export default AutoSyllableToggle;
