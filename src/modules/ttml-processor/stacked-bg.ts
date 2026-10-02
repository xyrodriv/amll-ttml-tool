/**
 * 叠加背景歌词（stacked background vocals）支持。
 *
 * WASM 处理器的数据模型里，每个 `<p>` 至多只有一条背景行
 * （`backgroundVocal`），因此：
 * - 保存时，连续多条背景行只有第一条会被写成 `x-bg`，
 *   其余会被写成普通 `<p>`（丢失背景标记，重新打开变回普通行）；
 * - 打开时，同一个 `<p>` 里的多个 `x-bg` 会被合并成一条背景行，
 *   并且首尾括号会被吃掉。
 *
 * 这里在 JS 层补齐这两件事（由 `allowStackedBgVocalsAtom` 开关控制）：
 * - 保存前把连续背景行折叠成一条，生成后再把合并出来的 `x-bg`
 *   按时间范围拆回多个 `x-bg` span；
 * - 打开时直接从原始 XML 把多个 `x-bg` 拆回多条背景行。
 *
 * 所有操作都是防御性的：任何结构对不上 / 解析失败的情况都会原样返回，
 * 不会让保存或打开失败。本文件刻意保持零运行时依赖，便于单独测试。
 */
import type { AmllLyricLine, AmllLyricResult, AmllLyricWord } from "./types";

//#region 小工具

const TT_METADATA_NS = "http://www.w3.org/ns/ttml#metadata";

/**
 * 解析 TTML 时间属性
 *
 * 兼容生成器输出的秒数（`"1.000"`）、时钟格式（`"00:00:01.000"`）、
 * `"1000ms"`、`"2.5s"` 等常见写法；无法识别时返回 0
 */
export function parseTtmlClockTime(value: string | null | undefined): number {
	if (!value) return 0;
	const trimmed = value.trim();
	if (!trimmed) return 0;
	const clock = trimmed.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
	if (clock) {
		const h = Number.parseInt(clock[1] ?? "0", 10);
		const m = Number.parseInt(clock[2], 10);
		const s = Number.parseFloat(clock[3]);
		return Math.round((h * 3600 + m * 60 + s) * 1000);
	}
	const ms = trimmed.match(/^(\d+(?:\.\d+)?)ms$/);
	if (ms) return Math.round(Number.parseFloat(ms[1]));
	const sec = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
	if (sec) return Math.round(Number.parseFloat(sec[1]) * 1000);
	if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
		return Math.round(Number.parseFloat(trimmed) * 1000);
	}
	return 0;
}

/** 把毫秒格式化成生成器使用的秒数字符串（`"2.500"`） */
function formatTtmlSeconds(ms: number): string {
	return (ms / 1000).toFixed(3);
}

/** 读取元素的 `ttm:role` 属性（容忍命名空间前缀差异） */
function getElementRole(element: Element): string | null {
	for (const attr of Array.from(element.attributes)) {
		if (
			attr.localName === "role" &&
			(attr.name === "ttm:role" || attr.namespaceURI === TT_METADATA_NS)
		) {
			return attr.value;
		}
	}
	return null;
}

/** 元素或其子节点里，角色不是翻译/音译的可见文本 */
function collectVisibleText(element: Element): string {
	let text = "";
	for (const node of Array.from(element.childNodes)) {
		if (node.nodeType === 3 /* TEXT_NODE */) {
			text += node.textContent ?? "";
			continue;
		}
		if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;
		const el = node as Element;
		const role = getElementRole(el);
		if (role === "x-translation" || role === "x-roman") continue;
		text += collectVisibleText(el);
	}
	return text;
}

/** 一条背景行的时间范围（毫秒），优先用词级时间戳，退回行级 */
function bgPartRange(line: AmllLyricLine): { start: number; end: number } {
	const timed = line.words.filter((w) => w.startTime > 0 || w.endTime > 0);
	if (timed.length > 0) {
		return {
			start: Math.round(Math.min(...timed.map((w) => w.startTime))),
			end: Math.round(Math.max(...timed.map((w) => w.endTime))),
		};
	}
	return { start: Math.round(line.startTime), end: Math.round(line.endTime) };
}
//#endregion

//#region 保存方向：折叠连续背景行，生成后拆回多个 x-bg

/** 折叠计划里的一条原始背景行 */
export interface StackedBgPart {
	startTime: number;
	endTime: number;
	translatedLyric: string;
	romanLyric: string;
}

/** 折叠计划里的一组背景行（挂在第 `pIndex` 个 `<p>` 上） */
export interface StackedBgGroup {
	pIndex: number;
	parts: StackedBgPart[];
}

export interface StackedBgExportPlan {
	groups: StackedBgGroup[];
}

/**
 * 把连续的背景行折叠成一条（生成器只支持每行一条背景）
 *
 * 折叠只会发生在「前面紧跟主行」的背景行组上；文件开头没有主行可依附的
 * 背景行保持原样（与旧行为一致）。返回的 plan 记录了每个组要拆回的
 * 份数、时间范围和各自的翻译/音译，供 `splitStackedBgInXml` 使用。
 */
export function collapseStackedBgForExport(result: AmllLyricResult): {
	result: AmllLyricResult;
	plan: StackedBgExportPlan;
} {
	const groups: StackedBgGroup[] = [];
	const out: AmllLyricLine[] = [];
	const lines = result.lyricLines;
	let pCount = 0;
	let prevLineWasMain = false;
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.isBG) {
			out.push(line);
			pCount++;
			prevLineWasMain = true;
			i++;
			continue;
		}
		const groupStart = i;
		while (i < lines.length && lines[i].isBG) i++;
		const group = lines.slice(groupStart, i);
		const prev = out[out.length - 1];
		const hasPrevMain = prev !== undefined && !prev.isBG;
		if (group.length === 1 || !hasPrevMain || pCount === 0) {
			// 无需（或无法）折叠，保持旧行为：
			// 紧跟主行的第一条背景行附加到主行的 <p>，其余生成独立的 <p>
			for (const g of group) {
				out.push(g);
				if (prevLineWasMain && pCount > 0) {
					prevLineWasMain = false;
				} else {
					pCount++;
					prevLineWasMain = false;
				}
			}
			continue;
		}
		// 折叠进第一条背景行（紧跟主行，附加到主行的 <p>，不产生新 <p>）
		const merged: AmllLyricLine = {
			...group[0],
			words: group.flatMap((g) => g.words),
			startTime: group[0].startTime,
			endTime: group[group.length - 1].endTime,
		};
		out.push(merged);
		prevLineWasMain = false;
		groups.push({
			pIndex: pCount - 1,
			parts: group.map((g) => {
				const range = bgPartRange(g);
				return {
					startTime: range.start,
					endTime: range.end,
					translatedLyric: g.translatedLyric,
					romanLyric: g.romanLyric,
				};
			}),
		});
	}
	return { result: { ...result, lyricLines: out }, plan: { groups } };
}

/**
 * 把生成出来的 TTML 里被折叠的 `x-bg` span 拆回多个 `x-bg` span
 *
 * 每个组对应第 `pIndex` 个 `<p>`：按时间范围把 `x-bg` 里的词 span
 * 分配回各条原始背景行，并为第 2 条起补上各自的翻译/音译 span。
 * 任何对不上的情况都会跳过该组（保持生成器原始输出）。
 */
export function splitStackedBgInXml(
	xml: string,
	plan: StackedBgExportPlan,
): string {
	if (!plan.groups.length) return xml;
	try {
		const doc = new DOMParser().parseFromString(xml, "text/xml");
		if (doc.getElementsByTagName("parsererror").length > 0) return xml;
		const pElements = Array.from(doc.getElementsByTagName("p"));
		for (const group of plan.groups) {
			const p = pElements[group.pIndex];
			if (!p) continue;
			const bgSpan = Array.from(p.children).find(
				(el) => getElementRole(el) === "x-bg",
			);
			if (!bgSpan) continue;
			const wordSpans = Array.from(bgSpan.children).filter(
				(el) => getElementRole(el) === null,
			);
			if (wordSpans.length === 0) continue;

			// 按时间范围把词 span 分配回各条背景行。
			// 用「完全落在范围内」而不是只看 begin：相邻两条背景行共享边界时，
			// 只看 begin 会把下一条的首词错误地分给上一条。
			const buckets: Element[][] = group.parts.map(() => []);
			let cursor = 0;
			let failed = false;
			for (const span of wordSpans) {
				const s = parseTtmlClockTime(span.getAttribute("begin"));
				const e = parseTtmlClockTime(span.getAttribute("end"));
				let assigned = false;
				for (let k = cursor; k < group.parts.length; k++) {
					const part = group.parts[k];
					if (s >= part.startTime - 1 && e <= part.endTime + 1) {
						buckets[k].push(span);
						cursor = k;
						assigned = true;
						break;
					}
				}
				if (!assigned) {
					failed = true;
					break;
				}
			}
			if (failed || buckets.some((b) => b.length === 0)) continue;

			const translationSpan = Array.from(bgSpan.children).find(
				(el) => getElementRole(el) === "x-translation",
			);
			const romanSpan = Array.from(bgSpan.children).find(
				(el) => getElementRole(el) === "x-roman",
			);
			const parent = bgSpan.parentElement;
			if (!parent) continue;

			const newSpans: Element[] = [];
			for (let k = 0; k < group.parts.length; k++) {
				const part = group.parts[k];
				const bucket = buckets[k];
				const newBg = doc.createElementNS(bgSpan.namespaceURI, "span");
				newBg.setAttribute("ttm:role", "x-bg");
				newBg.setAttribute(
					"begin",
					formatTtmlSeconds(
						parseTtmlClockTime(bucket[0].getAttribute("begin")),
					),
				);
				newBg.setAttribute(
					"end",
					formatTtmlSeconds(
						parseTtmlClockTime(bucket[bucket.length - 1].getAttribute("end")),
					),
				);
				for (const span of bucket) newBg.appendChild(span);
				if (k === 0) {
					// 第一条沿用生成器生成的翻译/音译 span
					if (translationSpan) newBg.appendChild(translationSpan);
					if (romanSpan) newBg.appendChild(romanSpan);
				} else {
					if (translationSpan && part.translatedLyric.trim()) {
						const clone = doc.createElementNS(
							translationSpan.namespaceURI,
							"span",
						);
						clone.setAttribute("ttm:role", "x-translation");
						const lang = translationSpan.getAttribute("xml:lang");
						if (lang) clone.setAttribute("xml:lang", lang);
						clone.textContent = part.translatedLyric;
						newBg.appendChild(clone);
					}
					if (romanSpan && part.romanLyric.trim()) {
						const clone = doc.createElementNS(romanSpan.namespaceURI, "span");
						clone.setAttribute("ttm:role", "x-roman");
						const lang = romanSpan.getAttribute("xml:lang");
						if (lang) clone.setAttribute("xml:lang", lang);
						clone.textContent = part.romanLyric;
						newBg.appendChild(clone);
					}
				}
				newSpans.push(newBg);
			}

			for (const span of newSpans) {
				parent.insertBefore(span, bgSpan);
			}
			parent.removeChild(bgSpan);
		}
		return new XMLSerializer().serializeToString(doc);
	} catch {
		return xml;
	}
}
//#endregion

//#region 打开方向：把同一 <p> 里的多个 x-bg 拆回多条背景行

/** 从原始 XML 的一个 `x-bg` span 重建一条背景行 */
function bgLineFromXmlSpan(bgSpan: Element, isDuet: boolean): AmllLyricLine {
	const words: AmllLyricWord[] = [];
	let translatedLyric = "";
	let romanLyric = "";
	for (const node of Array.from(bgSpan.childNodes)) {
		if (node.nodeType === 3 /* TEXT_NODE */) {
			const text = node.textContent ?? "";
			if (words.length > 0) words[words.length - 1].word += text;
			continue;
		}
		if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;
		const el = node as Element;
		const role = getElementRole(el);
		if (role === "x-translation") {
			translatedLyric = (el.textContent ?? "").trim();
			continue;
		}
		if (role === "x-roman") {
			romanLyric = (el.textContent ?? "").trim();
			continue;
		}
		words.push({
			startTime: parseTtmlClockTime(el.getAttribute("begin")),
			endTime: parseTtmlClockTime(el.getAttribute("end")),
			word: collectVisibleText(el),
		});
	}
	if (words.length === 0) {
		// 行级时间戳的文件：整个 x-bg 就是一个「词」
		words.push({
			startTime: parseTtmlClockTime(bgSpan.getAttribute("begin")),
			endTime: parseTtmlClockTime(bgSpan.getAttribute("end")),
			word: collectVisibleText(bgSpan),
		});
	}
	const timed = words.filter((w) => w.startTime > 0 || w.endTime > 0);
	const startTime =
		timed.length > 0
			? Math.min(...timed.map((w) => w.startTime))
			: parseTtmlClockTime(bgSpan.getAttribute("begin"));
	const endTime =
		timed.length > 0
			? Math.max(...timed.map((w) => w.endTime))
			: parseTtmlClockTime(bgSpan.getAttribute("end"));
	return {
		words,
		translatedLyric,
		romanLyric,
		isBG: true,
		isDuet,
		startTime,
		endTime,
	};
}

/**
 * 把旧解析器合并成一条的背景行，按原始 XML 里的 `x-bg` span 边界
 * 拆回多条背景行
 *
 * 行数与 `<p>` 数量对不上时（结构不符合预期）整体放弃，返回原数组。
 */
export function splitMergedBgLines(
	ttmlContent: string,
	lyricLines: AmllLyricLine[],
): AmllLyricLine[] {
	try {
		const doc = new DOMParser().parseFromString(ttmlContent, "text/xml");
		if (doc.getElementsByTagName("parsererror").length > 0) return lyricLines;
		const pElements = Array.from(doc.getElementsByTagName("p"));
		if (pElements.length === 0) return lyricLines;
		const out: AmllLyricLine[] = [];
		let cursor = 0;
		for (const p of pElements) {
			if (cursor >= lyricLines.length) return lyricLines;
			const mainLine = lyricLines[cursor++];
			if (mainLine.isBG) return lyricLines;
			out.push(mainLine);
			const bgSpans = Array.from(p.children).filter(
				(el) => getElementRole(el) === "x-bg",
			);
			if (bgSpans.length === 0) continue;
			if (cursor >= lyricLines.length || !lyricLines[cursor].isBG) {
				return lyricLines;
			}
			const mergedBg = lyricLines[cursor++];
			// 统一从原始 XML 重建背景行：多个 x-bg 拆回多条，单个 x-bg 也照原样
			// 重建（旧解析器会吃掉首尾括号，这里保持字面内容，往返无损）
			for (const bgSpan of bgSpans) {
				out.push(bgLineFromXmlSpan(bgSpan, mergedBg.isDuet));
			}
		}
		if (cursor !== lyricLines.length) return lyricLines;
		return out;
	} catch {
		return lyricLines;
	}
}
//#endregion
