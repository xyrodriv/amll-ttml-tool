/**
 * @description 管理分词设置的持久化状态
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

type Scope = "all" | "range";
type PunctuationMode = "merge" | "standalone";
type CustomRulesMap = Map<string, string[]>;
type CustomRulesStorage = [string, string[]][];

export const segmentationScopeAtom = atomWithStorage<Scope>(
	"segmentation.scope",
	"all",
);
export const segmentationRangeStartAtom = atomWithStorage(
	"segmentation.rangeStart",
	"1",
);
export const segmentationRangeEndAtom = atomWithStorage(
	"segmentation.rangeEnd",
	"1",
);
export const segmentationSplitCJKAtom = atomWithStorage(
	"segmentation.splitCJK",
	true,
);
export const segmentationSplitEnglishAtom = atomWithStorage(
	"segmentation.splitEnglish",
	false,
);
export const segmentationPunctuationModeAtom = atomWithStorage<PunctuationMode>(
	"segmentation.punctuationMode",
	"merge",
);
export const segmentationPunctuationWeightAtom = atomWithStorage(
	"segmentation.punctuationWeight",
	"0.2",
);
export const segmentationRemoveEmptySegmentsAtom = atomWithStorage(
	"segmentation.removeEmptySegments",
	true,
);
export const segmentationIgnoreListTextAtom = atomWithStorage(
	"segmentation.ignoreListText",
	"",
);

const segmentationCustomRulesStorageAtom = atomWithStorage<CustomRulesStorage>(
	"segmentation.customRules",
	[],
);

export const segmentationCustomRulesAtom = atom<
	CustomRulesMap,
	[CustomRulesMap],
	void
>(
	(get) => {
		const rulesArray = get(segmentationCustomRulesStorageAtom);
		return new Map(rulesArray);
	},
	(_get, set, newMap) => {
		const rulesArray = Array.from(newMap.entries());
		set(segmentationCustomRulesStorageAtom, rulesArray);
	},
);

export const segmentationLangAtom = atom<string>("en-us");

export const splitWordApplyToAllAtom = atomWithStorage(
	"splitWord.applyToAll",
	false,
);
export const splitWordIgnoreCaseAtom = atomWithStorage(
	"splitWord.ignoreCase",
	true,
);

/**
 * 「自动拆分英文音节」开关
 *
 * 打开时把全篇可拆的英文单词拆成 `word.ruby[]` 音节，关闭时只还原本开关生成的音节。
 * 两个方向都是一次可撤销的操作。
 */
export const autoSplitEnglishSyllablesAtom = atomWithStorage(
	"segmentation.autoSplitEnglishSyllables",
	false,
);

/** 自动拆音节使用的语言，默认 en-us */
export const autoSplitSyllablesLangAtom = atomWithStorage(
	"segmentation.autoSplitSyllablesLang",
	"en-us",
);
