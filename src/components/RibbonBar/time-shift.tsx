/*
 * “平移时间”按钮：原先放在顶部「编辑」菜单里，现在挪到 Ribbon 最右侧。
 * Time Shift, moved out of the top Edit menu onto the far right of the ribbon.
 */

import { timeShiftDialogAtom } from "$/states/dialogs.ts";
import { Button } from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { RibbonSection } from "./common";

export const TimeShiftSection = () => {
	const setTimeShiftDialog = useSetAtom(timeShiftDialogAtom);
	const { t } = useTranslation();

	return (
		<RibbonSection label={t("ribbonBar.timeShift.title", "平移时间")}>
			<Button size="1" variant="soft" onClick={() => setTimeShiftDialog(true)}>
				{t("ribbonBar.timeShift.open", "平移时间...")}
			</Button>
		</RibbonSection>
	);
};
