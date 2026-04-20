import { decodeUtf8Loose, toUint8Array } from "./scaleBytes";

export type ParsedMenuRow = { name: string; description: string };

/** Decode a `TemplatePallet::Restaurants` map value (on-chain `Restaurant`). */
export function parseRestaurantValue(raw: unknown): { venueName: string; menu: ParsedMenuRow[] } {
	if (raw === undefined || raw === null) {
		return { venueName: "", menu: [] };
	}
	let inner = raw;
	if (typeof inner === "object" && inner !== null && "type" in inner && "value" in inner) {
		const o = inner as { type: string; value: unknown };
		if (o.type === "None") return { venueName: "", menu: [] };
		if (o.type === "Some") inner = o.value;
	}
	const rec = inner as { name?: unknown; menu?: unknown };
	const venueName = decodeUtf8Loose(toUint8Array(rec.name));
	const menuRaw = rec.menu;
	const menu: ParsedMenuRow[] = [];
	if (Array.isArray(menuRaw)) {
		for (const item of menuRaw) {
			const row = item as { name?: unknown; description?: unknown };
			menu.push({
				name: decodeUtf8Loose(toUint8Array(row.name)),
				description: decodeUtf8Loose(toUint8Array(row.description)),
			});
		}
	}
	return { venueName, menu };
}
