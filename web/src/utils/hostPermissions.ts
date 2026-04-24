import { hostApi } from "@novasamatech/product-sdk";
import { enumValue } from "@novasamatech/host-api";

function isInHost(): boolean {
	if (typeof window === "undefined") return false;
	if ((window as Window & { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) return true;
	try {
		return window !== window.top;
	} catch {
		return true;
	}
}

export async function requestExternalPermission(wsUrl: string): Promise<void> {
	if (!isInHost()) return;

	await hostApi.permission(enumValue("v1", { tag: "ExternalRequest", value: wsUrl })).match(
		() => {},
		(err: unknown) => console.warn("ExternalRequest permission denied:", err),
	);
}
