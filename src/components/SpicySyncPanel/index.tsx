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

import {
	ArrowSync16Regular,
	Dismiss16Regular,
	Flash16Regular,
} from "@fluentui/react-icons";
import { Box, Flex, IconButton, Select, Text } from "@radix-ui/themes";
import { useAtom, useSetAtom } from "jotai";
import {
	lazy,
	type PointerEvent as ReactPointerEvent,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	showSpicySyncPanelAtom,
	spicyAutoRefreshSecAtom,
	spicySyncPanelLiteAtom,
	spicySyncPanelWidthAtom,
} from "$/modules/settings/states/sync.ts";
import styles from "./index.module.css";

// 面板只在打轴模式下按需挂载，所以这里再 lazy 一次，
// 不进打轴页就不会把 Spicy 渲染器和 kawarp 拉进来
const SpicyPreview = lazy(() => import("../SpicyLyrics"));

const MIN_WIDTH = 260;
const MAX_WIDTH = 760;

const AUTO_REFRESH_OPTIONS = [0, 15, 30, 60, 120, 300];

/**
 * 打轴页右侧的 Spicy 歌词预览面板。
 * 左边有一根可以拖的手柄，宽度会存进 localStorage。
 */
export const SpicySyncPanel = () => {
	const [width, setWidth] = useAtom(spicySyncPanelWidthAtom);
	const setShow = useSetAtom(showSpicySyncPanelAtom);
	const [autoRefreshSec, setAutoRefreshSec] = useAtom(spicyAutoRefreshSecAtom);
	const [lite, setLite] = useAtom(spicySyncPanelLiteAtom);
	const { t } = useTranslation();

	// 换 key = 整块重新挂载：spring 缓存、DOM、kawarp 实例全部重建。
	// 长时间播放掉帧的时候这是最彻底的复位手段。
	const [refreshKey, setRefreshKey] = useState(0);
	const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

	useEffect(() => {
		if (autoRefreshSec <= 0) return;
		const id = setInterval(refresh, autoRefreshSec * 1000);
		return () => clearInterval(id);
	}, [autoRefreshSec, refresh]);

	// 必须用 ref：拖动时每次 move 都会 setWidth 触发重渲染，
	// 普通 let 变量会被重置成 false，拖一格就断了
	const dragging = useRef(false);

	const onPointerDown = (evt: ReactPointerEvent<HTMLDivElement>) => {
		evt.preventDefault();
		dragging.current = true;
		evt.currentTarget.setPointerCapture(evt.pointerId);
	};

	const onPointerMove = (evt: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		// 面板贴着窗口右边缘，所以宽度就是右边缘到指针的距离
		const next = window.innerWidth - evt.clientX;
		setWidth(Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next))));
	};

	const onPointerUp = (evt: ReactPointerEvent<HTMLDivElement>) => {
		dragging.current = false;
		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}
	};

	return (
		<div className={styles.panel} style={{ width }}>
			<div
				className={styles.handle}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				role="separator"
				aria-orientation="vertical"
				aria-label={t("ribbonBar.syncMode.resizeSpicyPanel", "Resize preview")}
			/>
			<Flex
				className={styles.header}
				align="center"
				justify="between"
				gap="2"
				flexShrink="0"
			>
				<Text size="1" weight="bold" wrap="nowrap" className={styles.title}>
					{t("ribbonBar.syncMode.spicyPanelTitle", "Spicy Lyrics")}
				</Text>
				<Flex align="center" gap="1" flexShrink="0">
					<IconButton
						size="1"
						variant={lite ? "solid" : "ghost"}
						color={lite ? undefined : "gray"}
						title={t(
							"ribbonBar.syncMode.liteSpicyPanel",
							"Lite mode — fewer animated lines, no glow. Turn off for the full effect.",
						)}
						aria-label={t("ribbonBar.syncMode.lite", "Lite mode")}
						onClick={() => setLite(!lite)}
					>
						<Flash16Regular />
					</IconButton>
					<Select.Root
						size="1"
						value={String(autoRefreshSec)}
						onValueChange={(value) => setAutoRefreshSec(Number(value))}
					>
						<Select.Trigger
							variant="ghost"
							className={styles.autoSelect}
							title={t("ribbonBar.syncMode.autoRefresh", "Auto-refresh")}
							aria-label={t("ribbonBar.syncMode.autoRefresh", "Auto-refresh")}
						/>
						<Select.Content>
							{AUTO_REFRESH_OPTIONS.map((sec) => (
								<Select.Item key={sec} value={String(sec)}>
									{sec === 0
										? t("ribbonBar.syncMode.autoRefreshOff", "Off")
										: `${sec}s`}
								</Select.Item>
							))}
						</Select.Content>
					</Select.Root>
					<IconButton
						size="1"
						variant="ghost"
						color="gray"
						title={t("ribbonBar.syncMode.refreshSpicyPanel", "Refresh preview")}
						aria-label={t(
							"ribbonBar.syncMode.refreshSpicyPanel",
							"Refresh preview",
						)}
						onClick={refresh}
					>
						<ArrowSync16Regular />
					</IconButton>
					<IconButton
						size="1"
						variant="ghost"
						color="gray"
						title={t("ribbonBar.syncMode.closeSpicyPanel", "Close preview")}
						aria-label={t(
							"ribbonBar.syncMode.closeSpicyPanel",
							"Close preview",
						)}
						onClick={() => setShow(false)}
					>
						<Dismiss16Regular />
					</IconButton>
				</Flex>
			</Flex>
			<Box className={styles.body} flexGrow="1" minHeight="0">
				<Suspense fallback={null}>
					<SpicyPreview key={refreshKey} lite={lite} />
				</Suspense>
			</Box>
		</div>
	);
};

export default SpicySyncPanel;
