/**
 * @description 英文单词音节自动拆分
 *
 * 与 `segmentation.ts` 里的「分词」不同：分词会把一个 `LyricWord` 拆成多个平级的
 * `LyricWord`，而这里是把一个单词拆成 `word.ruby[]` 音节 —— 单词本身保持不变，
 * 只是多了一层逐音节的起止时间。这正是 AMLL 表示「同一个词内的音节」的方式，
 * 也是波形上紫色音节标记的数据来源。
 */

import type { LyricLine, LyricWord, LyricWordBase } from "$/types/ttml";
import type { HyphenatorFunc } from "../types";

/** 软连字符，hyphen 库用它标记音节分界 */
const SOFT_HYPHEN = "­";

/** 只处理纯拉丁字母词（允许内部有撇号/连字符） */
const LATIN_WORD = /^[A-Za-z][A-Za-z'’-]*$/;

/**
 * 把一个英文单词拆成音节
 * @returns 音节数组；无法拆分（非英文、单音节、拆分结果拼不回原词）时返回 null
 */
export function splitEnglishWordIntoSyllables(
	text: string,
	hyphenator: HyphenatorFunc,
): string[] | null {
	const trimmed = text.trim();
	if (trimmed.length < 2) return null;
	if (!LATIN_WORD.test(trimmed)) return null;

	const syllables = hyphenator(trimmed)
		.split(SOFT_HYPHEN)
		.filter((part) => part.length > 0);

	if (syllables.length < 2) return null;
	// 保险：拆分结果必须能拼回原词，否则宁可不拆
	if (syllables.join("") !== trimmed) return null;

	return syllables;
}

/**
 * 把单词已有的时长按音节长度权重分配给各音节
 *
 * 单词未打轴（时长为 0）时，所有音节都沿用单词本身的时间
 */
function distributeSyllableTime(
	word: LyricWord,
	syllables: string[],
): LyricWordBase[] {
	const total = word.endTime - word.startTime;

	if (total <= 0) {
		return syllables.map((syllable) => ({
			word: syllable,
			startTime: word.startTime,
			endTime: word.endTime,
		}));
	}

	const weights = syllables.map((syllable) => Math.max(1, syllable.length));
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);
	const durationPerWeight = total / totalWeight;

	const result: LyricWordBase[] = [];
	let cursor = word.startTime;

	for (let i = 0; i < syllables.length; i++) {
		const isLast = i === syllables.length - 1;
		const start = cursor;
		// 最后一个音节直接对齐到单词结束时间，避免累计误差
		const end = isLast
			? word.endTime
			: Math.round(start + weights[i] * durationPerWeight);

		result.push({ word: syllables[i], startTime: start, endTime: end });
		cursor = end;
	}

	return result;
}

/**
 * 判断一个单词能否被自动拆音节（供 UI 统计数量用，不修改数据）
 */
export function canAutoSplitWord(
	word: LyricWord,
	hyphenator: HyphenatorFunc | undefined,
): boolean {
	if (!hyphenator) return false;
	// 已经有音节的字不重复处理，避免覆盖手动录入的 ruby
	if (word.ruby && word.ruby.length > 0) return false;
	return splitEnglishWordIntoSyllables(word.word, hyphenator) !== null;
}

/**
 * 对整份歌词执行「自动拆分英文音节」
 * @returns 被拆分的单词数量
 */
export function applyAutoSyllableSplit(
	lines: LyricLine[],
	hyphenator: HyphenatorFunc | undefined,
): number {
	if (!hyphenator) return 0;

	let changed = 0;

	for (const line of lines) {
		for (const word of line.words) {
			if (!canAutoSplitWord(word, hyphenator)) continue;

			const syllables = splitEnglishWordIntoSyllables(word.word, hyphenator);
			if (!syllables) continue;

			word.ruby = distributeSyllableTime(word, syllables);
			word.rubyAuto = true;
			changed++;
		}
	}

	return changed;
}

/**
 * 撤销「自动拆分英文音节」
 *
 * 只清除带 `rubyAuto` 标记的音节，手动录入的 ruby 不受影响
 * @returns 被还原的单词数量
 */
export function revertAutoSyllableSplit(lines: LyricLine[]): number {
	let changed = 0;

	for (const line of lines) {
		for (const word of line.words) {
			if (!word.rubyAuto) continue;

			delete word.ruby;
			delete word.rubyAuto;
			changed++;
		}
	}

	return changed;
}

/**
 * 统计当前有多少单词带自动生成的音节（供 UI 显示）
 */
export function countAutoSplitWords(lines: LyricLine[]): number {
	let count = 0;
	for (const line of lines) {
		for (const word of line.words) {
			if (word.rubyAuto && word.ruby && word.ruby.length > 0) count++;
		}
	}
	return count;
}
