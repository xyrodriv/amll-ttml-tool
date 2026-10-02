import { Button, Dialog, Flex } from "@radix-ui/themes";
import { useAtom, useAtomValue, useStore } from "jotai";
import saveFile from "save-file";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
	amllToTTML,
	ttmlLyricToAmllResult,
} from "$/modules/ttml-processor/index.ts";
import { useTtmlErrorHandler } from "$/modules/ttml-processor/useTtmlErrorHandler.ts";
import { updateDialogOpenAtom } from "$/states/dialogs.ts";
import {
	isDirtyAtom,
	lyricLinesAtom,
	saveFileNameAtom,
} from "$/states/main.ts";
import { applyPendingUpdate } from "$/utils/pwa.tsx";

/**
 * Shown when the user hits "Refresh" on the update toast, so unsaved lyrics can be
 * written to a TTML file before the page navigates away to the new build.
 */
export const UpdateDialog = () => {
	const [open, setOpen] = useAtom(updateDialogOpenAtom);
	const isDirty = useAtomValue(isDirtyAtom);
	const store = useStore();
	const { t } = useTranslation();
	const handleTtmlError = useTtmlErrorHandler();
	const [saving, setSaving] = useState(false);

	const close = () => setOpen(false);

	const reloadNow = () => {
		close();
		applyPendingUpdate();
	};

	const saveAndReload = async () => {
		setSaving(true);
		try {
			const amllResult = ttmlLyricToAmllResult(store.get(lyricLinesAtom));
			const result = amllToTTML(amllResult);
			if (!result.success) {
				handleTtmlError(result.error, "Failed to generate TTML before update");
				setSaving(false);
				return;
			}
			await saveFile(
				new Blob([result.data], { type: "text/xml" }),
				store.get(saveFileNameAtom),
			);
		} catch {
			toast.error(
				t(
					"pwa.updateDialog.saveFailed",
					"Could not save your lyrics — reload cancelled.",
				),
			);
			setSaving(false);
			return;
		}
		setSaving(false);
		close();
		// Let the browser actually start the download before navigating away.
		setTimeout(applyPendingUpdate, 600);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					{t("pwa.updateDialog.title", "Update ready")}
				</Dialog.Title>
				<Dialog.Description>
					{isDirty
						? t(
								"pwa.updateDialog.descriptionDirty",
								"A new version is ready. You have unsaved changes — save your lyrics to a TTML file before reloading?",
							)
						: t(
								"pwa.updateDialog.descriptionClean",
								"A new version is ready. Reload to switch to it.",
							)}
				</Dialog.Description>
				<Flex gap="3" mt="4" justify="end">
					<Button variant="soft" color="gray" onClick={close}>
						{t("pwa.updateDialog.later", "Later")}
					</Button>
					<Button variant="soft" onClick={reloadNow}>
						{t("pwa.updateDialog.reloadNow", "Reload now")}
					</Button>
					{isDirty && (
						<Button onClick={saveAndReload} loading={saving}>
							{t("pwa.updateDialog.saveAndReload", "Save & reload")}
						</Button>
					)}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
