import { registerSW } from "virtual:pwa-register";
import { Button, Flex } from "@radix-ui/themes";
import { t } from "i18next";
import { toast } from "react-toastify";

const UPDATE_TOAST_ID = "pwa-update-available";
// How often a long-lived tab re-checks the service worker for a newer build.
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;

if (!import.meta.env.TAURI_ENV_PLATFORM) {
	let registration: ServiceWorkerRegistration | undefined;

	// Ask the browser to re-fetch sw.js. If a newer build is out there, workbox moves the
	// new worker into `waiting`, which fires `onNeedRefresh` below.
	const checkForUpdate = () => {
		registration?.update().catch(() => {});
	};

	const refresh = registerSW({
		onRegisteredSW(_swUrl, reg) {
			registration = reg ?? undefined;
		},
		onOfflineReady() {
			toast.info(
				t("pwa.offlineReady", "网站已成功离线缓存，后续可离线访问本网页"),
			);
		},
		onNeedRefresh() {
			showUpdateToast();
		},
	});

	function showUpdateToast() {
		// Never auto-dismiss: missing this means the user keeps editing on a stale bundle.
		if (toast.isActive(UPDATE_TOAST_ID)) return;
		toast.info(
			() => (
				<Flex direction="column" gap="2" align="stretch">
					<div>
						{t("pwa.updateRefresh", "网站已更新，刷新网页以使用最新版本！")}
					</div>
					<Button
						size="2"
						onClick={() => {
							refresh(true);
						}}
					>
						{t("pwa.refresh", "刷新")}
					</Button>
				</Flex>
			),
			{
				toastId: UPDATE_TOAST_ID,
				autoClose: false,
				closeOnClick: false,
				closeButton: true,
			},
		);
	}

	setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL);
	window.addEventListener("focus", checkForUpdate);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") checkForUpdate();
	});
}
