import { hostApi } from "@novasamatech/product-sdk";
import { enumValue } from "@novasamatech/host-api";
import { isInHost } from "./host";

export async function requestExternalPermission(wsUrl: string): Promise<void> {
	if (!isInHost()) return;

	await hostApi.permission(enumValue("v1", { tag: "ExternalRequest", value: wsUrl })).match(
		() => {},
		(err: unknown) => console.warn("ExternalRequest permission denied:", err),
	);
}
