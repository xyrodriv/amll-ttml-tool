import { produce } from "immer";
import { useStore } from "jotai";
import { type FC, useCallback } from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import type { LyricLine, LyricWord, LyricWordBase } from "$/types/ttml";
import {
	buildRubySelectionId,
	findNextWord,
	findPrevWord,
	getCurrentLineLocation,
	getCurrentLocation,
	getFirstSynchronizableUnit,
	getLastSynchronizableUnit,
	getSynchronizableUnits,
	isSynchronizableLine,
} from "$/modules/lyric-editor/utils/lyric-states";
import { normalizeLineTime } from "$/modules/lyric-editor/utils/normalize-line-time";
import {
	SyncJudgeMode,
	smartFirstWordAtom,
	smartLastWordAtom,
	syncJudgeModeAtom,
} from "$/modules/settings/states";
import {
	autoAdvanceOnMarkBeginAtom,
	autoClosePrevAcrossLinesAtom,
	autoClosePrevOnMarkBeginAtom,
	currentEmptyBeatAtom,
	nudgeStepMsAtom,
	smartFirstWordActiveIdAtom,
	syncTimeOffsetAtom,
} from "$/modules/settings/states/sync";
import {
	keyMoveNextLineAtom,
	keyMoveNextWordAndPlayAtom,
	keyMoveNextWordAtom,
	keyMovePrevLineAtom,
	keyMovePrevWordAndPlayAtom,
	keyMovePrevWordAtom,
	keyMoveLastWordAndPlayAtom,
	keyMoveFirstWordAndPlayAtom,
	keySyncEndAtom,
	keySyncNextAtom,
	keySyncStartAtom,
	keyNudgeWordBackwardAtom,
	keyNudgeWordForwardAtom,
	keyTapAltAtom,
} from "$/states/keybindings.ts";
import {
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
	tapModeAtom,
} from "$/states/main.ts";
import {
	type KeyBindingEvent,
	useKeyBindingAtom,
} from "$/utils/keybindings.ts";

const getUnitStartTime = (unit: {
	word: LyricWord;
	rubyWord?: LyricWordBase;
}) => unit.rubyWord?.startTime ?? unit.word.startTime;

const updateRubyParentTime = (word: LyricWord) => {
	if (!word.ruby || word.ruby.length === 0) return;
	const rubyStarts = word.ruby.map((ruby) => ruby.startTime);
	const rubyEnds = word.ruby.map((ruby) => ruby.endTime);
	word.startTime = Math.min(...rubyStarts);
	word.endTime = Math.max(...rubyEnds);
};

const setUnitStartTime = (
	line: LyricLine,
	wordIndex: number,
	rubyIndex: number | undefined,
	time: number,
) => {
	const word = line.words[wordIndex];
	if (rubyIndex !== undefined && word.ruby?.[rubyIndex]) {
		word.ruby[rubyIndex].startTime = time;
		updateRubyParentTime(word);
		return;
	}
	word.startTime = time;
};

const setUnitEndTime = (
	line: LyricLine,
	wordIndex: number,
	rubyIndex: number | undefined,
	time: number,
) => {
	const word = line.words[wordIndex];
	if (rubyIndex !== undefined && word.ruby?.[rubyIndex]) {
		word.ruby[rubyIndex].endTime = time;
		updateRubyParentTime(word);
		return;
	}
	word.endTime = time;
};

/** 整体平移一个时间单元（整字或音节），未打轴（0/0）的单元不动 */
const shiftUnit = (
	unit: { startTime: number; endTime: number },
	delta: number,
) => {
	if (unit.startTime === 0 && unit.endTime === 0) return;
	unit.startTime = Math.max(0, unit.startTime + delta);
	unit.endTime = Math.max(0, unit.endTime + delta);
};

/** 整体平移一个字；带音节的字连同所有音节一起平移 */
const shiftWord = (word: LyricWord, delta: number) => {
	if (word.ruby && word.ruby.length > 0) {
		for (const ruby of word.ruby) {
			shiftUnit(ruby, delta);
		}
		updateRubyParentTime(word);
		return;
	}
	shiftUnit(word, delta);
};

export const SyncKeyBinding: FC = () => {
	const store = useStore();

	const calcJudgeTime = useCallback(
		(evt: KeyBindingEvent) => {
			const syncTimeOffset = store.get(syncTimeOffsetAtom);
			const currentTime = Math.max(
				0,
				audioEngine.musicCurrentTime * 1000 + syncTimeOffset,
			);
			const syncJudgeMode = store.get(syncJudgeModeAtom);
			if (syncJudgeMode === SyncJudgeMode.FirstKeyDownTimeLegacy) {
				return (
					Math.max(
						0,
						audioEngine.musicCurrentTime * 1000 -
							evt.downTimeOffset +
							syncTimeOffset,
					) | 0
				);
			}
			let timeAdjustment = 0;
			if (audioEngine.musicPlaying) {
				switch (syncJudgeMode) {
					case SyncJudgeMode.FirstKeyDownTime:
						timeAdjustment -= evt.downTimeOffset;
						break;
					case SyncJudgeMode.LastKeyUpTime:
						break;
					case SyncJudgeMode.MiddleKeyTime:
						timeAdjustment -= currentTime - evt.downTimeOffset / 2;
						break;
				}
				timeAdjustment *= audioEngine.musicPlayBackRate;
			}
			return Math.max(0, currentTime + timeAdjustment) | 0;
		},
		[store],
	);

	const moveToNextWordBase = useCallback(
		(play: boolean): boolean => {
			const location = getCurrentLocation(store);
			if (!location) return false;
			const nextWord = findNextWord(
				location.lines,
				location.lineIndex,
				location.syncIndex,
			);
			if (!nextWord) return false;
			store.set(selectedWordsAtom, new Set([nextWord.unit.id]));
			store.set(selectedLinesAtom, new Set([nextWord.line.id]));
			store.set(currentEmptyBeatAtom, 0);
			if (play) audioEngine.seekMusic(getUnitStartTime(nextWord.unit) / 1000);
			return true;
		},
		[store],
	);

	const moveToNextWord = useCallback(
		() => moveToNextWordBase(false),
		[moveToNextWordBase],
	);
	const moveToNextWordAndPlay = useCallback(
		() => moveToNextWordBase(true),
		[moveToNextWordBase],
	);

	const moveToPrevWordBase = useCallback(
		(play: boolean): boolean => {
			const location = getCurrentLocation(store);
			if (!location) return false;
			if (location.syncIndex === 0) {
				if (location.lineIndex === 0) return false;
				const lastLineIndex = Math.max(0, location.lineIndex);
				const lastLine = location.lines
					.slice(0, lastLineIndex)
					.reverse()
					.find(
						(line) =>
							isSynchronizableLine(line) &&
							getSynchronizableUnits(line).length > 0,
					);
				if (!lastLine) return false;
				store.set(selectedLinesAtom, new Set([lastLine.id]));
				const lastUnit = getLastSynchronizableUnit(lastLine);
				if (!lastUnit) {
					store.set(selectedWordsAtom, new Set());
				} else {
					store.set(selectedWordsAtom, new Set([lastUnit.id]));
					if (play) audioEngine.seekMusic(getUnitStartTime(lastUnit) / 1000);
				}
			} else {
				const lineUnits = getSynchronizableUnits(location.line);
				const prevUnit = lineUnits[location.syncIndex - 1];
				if (!prevUnit) return false;
				store.set(selectedWordsAtom, new Set([prevUnit.id]));
				if (play) audioEngine.seekMusic(getUnitStartTime(prevUnit) / 1000);
			}
			return true;
		},
		[store],
	);
	const moveToPrevWord = useCallback(
		() => moveToPrevWordBase(false),
		[moveToPrevWordBase],
	);
	const moveToPrevWordAndPlay = useCallback(
		() => moveToPrevWordBase(true),
		[moveToPrevWordBase],
	);

	// 移动打轴光标

	useKeyBindingAtom(keyMoveNextLineAtom, () => {
		const location = getCurrentLineLocation(store);
		if (!location) return;
		const lastLineIndex = Math.min(
			location.lines.length,
			location.lineIndex + 1,
		);
		const lastLine = location.lines[lastLineIndex];
		if (!lastLine) return;
		store.set(selectedLinesAtom, new Set([lastLine.id]));
		const firstUnit = getFirstSynchronizableUnit(lastLine);
		if (!firstUnit) {
			store.set(selectedWordsAtom, new Set());
		} else {
			store.set(selectedWordsAtom, new Set([firstUnit.id]));
		}
	}, [store]);

	useKeyBindingAtom(keyMovePrevLineAtom, () => {
		const location = getCurrentLineLocation(store);
		if (!location) return;
		const lastLineIndex = Math.max(0, location.lineIndex - 1);
		const lastLine = location.lines[lastLineIndex];
		if (!lastLine) return;
		store.set(selectedLinesAtom, new Set([lastLine.id]));
		const firstUnit = getFirstSynchronizableUnit(lastLine);
		if (!firstUnit) {
			store.set(selectedWordsAtom, new Set());
		} else {
			store.set(selectedWordsAtom, new Set([firstUnit.id]));
		}
	}, [store]);

	useKeyBindingAtom(keyMoveNextWordAtom, moveToNextWord, [store]);
	useKeyBindingAtom(keyMoveNextWordAndPlayAtom, moveToNextWordAndPlay, [store]);
	useKeyBindingAtom(keyMovePrevWordAtom, moveToPrevWord, [store]);
	useKeyBindingAtom(keyMovePrevWordAndPlayAtom, moveToPrevWordAndPlay, [store]);

	useKeyBindingAtom(keyMoveLastWordAndPlayAtom, () => {
		const location = getCurrentLineLocation(store);
		if (!location) return;
		const lastUnit = getLastSynchronizableUnit(location.line);
		if (!lastUnit) return;
		store.set(selectedWordsAtom, new Set([lastUnit.id]));
		store.set(selectedLinesAtom, new Set([location.line.id]));
		audioEngine.seekMusic(getUnitStartTime(lastUnit) / 1000);
	}, [store]);

	useKeyBindingAtom(keyMoveFirstWordAndPlayAtom, () => {
		const location = getCurrentLineLocation(store);
		if (!location) return;
		const firstUnit = getFirstSynchronizableUnit(location.line);
		if (!firstUnit) return;
		store.set(selectedWordsAtom, new Set([firstUnit.id]));
		store.set(selectedLinesAtom, new Set([location.line.id]));
		audioEngine.seekMusic(getUnitStartTime(firstUnit) / 1000);
	}, [store]);

	// 记录时间戳（主要打轴按键）

	// 打一次轴（起始轴）。Tap 模式下 F 和 J 都走这里，所以抽成具名函数。
	const tapMarkBegin = useCallback(
		(evt: KeyBindingEvent) => {
			const location = getCurrentLocation(store);
			if (!location) return;
			const currentTime = calcJudgeTime(evt);

			const smartFirstWord = store.get(smartFirstWordAtom);
			if (smartFirstWord && location.isFirstWord) {
				store.set(smartFirstWordActiveIdAtom, location.word.id);
			}

			// Tap 模式就是为「一路按着敲」设计的，所以这两个开关强制打开，
			// 不管用户在时间页里存的是关还是开（存的值本身不动）。
			const tapMode = store.get(tapModeAtom);
			const autoClosePrev =
				tapMode || store.get(autoClosePrevOnMarkBeginAtom);
			// “跨行也闭合上一行末字”是“自动闭合上一字”的附加项，母开关关着时不生效。
			// Tap 模式下母开关恒为开，所以它直接听用户自己的开关。
			const autoCloseAcrossLines = tapMode
				? store.get(autoClosePrevAcrossLinesAtom)
				: autoClosePrev && store.get(autoClosePrevAcrossLinesAtom);
			// “打完自动跳下一字”只在“自动闭合上一字”也开着时才生效
			const autoAdvance =
				tapMode || (autoClosePrev && store.get(autoAdvanceOnMarkBeginAtom));

			store.set(lyricLinesAtom, (state) =>
				produce(state, (state) => {
					const line = state.lyricLines[location.lineIndex];
					if (location.isFirstWord) {
						line.startTime = currentTime;
					}
					setUnitStartTime(
						line,
						location.wordIndex,
						location.rubyIndex,
						currentTime,
					);

					// 起始轴时把上字的 end 也一起打到当前位置（开“自动闭合上字”时）
					// 默认只在同一行内闭合：换行时把上一行末字的 end 顶到下一行首字的
					// begin，会让上一行末字凭空多出一段时长。
					// 开了“跨行也闭合”之后才允许跨行，此时上一行的 endTime 也一起补上。
					if (autoClosePrev) {
						const prev = findPrevWord(
							state.lyricLines,
							location.lineIndex,
							location.syncIndex,
						);
						const acrossLines = prev
							? prev.lineIndex !== location.lineIndex
							: false;
						if (prev && (!acrossLines || autoCloseAcrossLines)) {
							setUnitEndTime(
								prev.line,
								prev.unit.wordIndex,
								prev.unit.rubyIndex,
								currentTime,
							);
							// 上一行的结束时间就是下一行首字的开始时间，
							// 和“下一轴”(G) 换行时的处理保持一致
							if (acrossLines) {
								prev.line.endTime = currentTime;
							}
						}
					}
				}),
			);

			// 写完再把光标推到下一字：必须在 store.set 之后，
			// 这样 findNextWord 读到的是刚落盘的新时间
			if (autoAdvance) moveToNextWord();
		},
		[store, moveToNextWord],
	);

	useKeyBindingAtom(keySyncStartAtom, tapMarkBegin, [tapMarkBegin]);
	// Tap 模式的第二打击键，和 F 完全等价，方便左右手交替
	useKeyBindingAtom(keyTapAltAtom, tapMarkBegin, [tapMarkBegin]);
	useKeyBindingAtom(
		keySyncNextAtom,
		(evt) => {
			const location = getCurrentLocation(store);
			if (!location) return;
			const currentTime = calcJudgeTime(evt);

			// 智能首字
			const smartFirstWord = store.get(smartFirstWordAtom);
			if (smartFirstWord && location.isFirstWord) {
				const activeId = store.get(smartFirstWordActiveIdAtom);
				if (activeId !== location.word.id) {
					store.set(lyricLinesAtom, (state) =>
						produce(state, (state) => {
							const line = state.lyricLines[location.lineIndex];
							line.startTime = currentTime;
							setUnitStartTime(
								line,
								location.wordIndex,
								location.rubyIndex,
								currentTime,
							);
						}),
					);
					store.set(smartFirstWordActiveIdAtom, location.word.id);
					return;
				}
			}
			store.set(smartFirstWordActiveIdAtom, null);

			const hasRuby = location.word.ruby?.length;
			if (!hasRuby) {
				const emptyBeat = store.get(currentEmptyBeatAtom);
				if (emptyBeat < location.word.emptyBeat) {
					store.set(currentEmptyBeatAtom, emptyBeat + 1);
					return;
				}
			}

			// 智能尾字
			const smartLastWord = store.get(smartLastWordAtom);
			if (smartLastWord && location.isLastWord) {
				store.set(lyricLinesAtom, (state) =>
					produce(state, (state) => {
						const line = state.lyricLines[location.lineIndex];
						setUnitEndTime(
							line,
							location.wordIndex,
							location.rubyIndex,
							currentTime,
						);
						line.endTime = currentTime;
					}),
				);
				moveToNextWord();
				return;
			}

			store.set(lyricLinesAtom, (state) =>
				produce(state, (state) => {
					const curLine = state.lyricLines[location.lineIndex];
					setUnitEndTime(
						curLine,
						location.wordIndex,
						location.rubyIndex,
						currentTime,
					);
					const nextWord = findNextWord(
						state.lyricLines,
						location.lineIndex,
						location.syncIndex,
					);
					if (nextWord) {
						if (curLine !== nextWord.line) {
							curLine.endTime = currentTime;
							nextWord.line.startTime = currentTime;
						}
						setUnitStartTime(
							nextWord.line,
							nextWord.unit.wordIndex,
							nextWord.unit.rubyIndex,
							currentTime,
						);
					}
				}),
			);
			moveToNextWord();

			// 开了智能首字后，连轴打到下一行时跳过智能首字
			if (smartFirstWord) {
				const newLocation = getCurrentLocation(store);
				if (newLocation?.isFirstWord) {
					store.set(smartFirstWordActiveIdAtom, newLocation.word.id);
				}
			}
		},
		[store, moveToNextWord],
	);
	useKeyBindingAtom(
		keySyncEndAtom,
		(evt) => {
			const location = getCurrentLocation(store);
			if (!location) return;
			const currentTime = calcJudgeTime(evt);
			store.set(lyricLinesAtom, (state) =>
				produce(state, (state) => {
					const line = state.lyricLines[location.lineIndex];
					setUnitEndTime(
						line,
						location.wordIndex,
						location.rubyIndex,
						currentTime,
					);
					if (location.isLastWord) {
						line.endTime = currentTime;
					}
				}),
			);
			moveToNextWord();
		},
		[store, moveToNextWord],
	);

	// Alt + ←/→ 微调所选内容的时间
	const nudgeSelection = useCallback(
		(deltaMs: number) => {
			if (deltaMs === 0) return;

			const selectedWords = store.get(selectedWordsAtom);
			const selectedLines = store.get(selectedLinesAtom);

			if (selectedWords.size === 0 && selectedLines.size === 0) return;

			store.set(lyricLinesAtom, (state) =>
				produce(state, (state) => {
					if (selectedWords.size > 0) {
						for (const line of state.lyricLines) {
							let lineChanged = false;

							for (const word of line.words) {
								const rubies = word.ruby;

								if (rubies && rubies.length > 0) {
									let rubyChanged = false;
									for (let r = 0; r < rubies.length; r++) {
										if (
											selectedWords.has(buildRubySelectionId(word.id, r))
										) {
											shiftUnit(rubies[r], deltaMs);
											rubyChanged = true;
										}
									}
									if (rubyChanged) {
										updateRubyParentTime(word);
										lineChanged = true;
										continue;
									}
								}

								if (selectedWords.has(word.id)) {
									shiftWord(word, deltaMs);
									lineChanged = true;
								}
							}

							if (lineChanged) normalizeLineTime(line);
						}
						return;
					}

					// 没选字时退化为整行平移
					for (const line of state.lyricLines) {
						if (!selectedLines.has(line.id)) continue;
						for (const word of line.words) {
							shiftWord(word, deltaMs);
						}
						shiftUnit(line, deltaMs);
						normalizeLineTime(line);
					}
				}),
			);
		},
		[store],
	);

	useKeyBindingAtom(
		keyNudgeWordBackwardAtom,
		() => {
			nudgeSelection(-store.get(nudgeStepMsAtom));
		},
		[store, nudgeSelection],
	);
	useKeyBindingAtom(
		keyNudgeWordForwardAtom,
		() => {
			nudgeSelection(store.get(nudgeStepMsAtom));
		},
		[store, nudgeSelection],
	);

	return null;
};
