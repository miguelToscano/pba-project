import { decodeUtf8Loose, toUint8Array } from "./scaleBytes";

const U128_MAX = (1n << 128n) - 1n;

/** Decode a SCALE `u128` (or nested Option) as returned by storage queries. */
export function parseScaleU128(raw: unknown): bigint {
	if (raw === undefined || raw === null) return 0n;
	if (typeof raw === "bigint") {
		if (raw < 0n) return 0n;
		return raw > U128_MAX ? U128_MAX : raw;
	}
	if (typeof raw === "number") {
		if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) return 0n;
		return BigInt(raw);
	}
	if (typeof raw === "string") {
		if (!/^\d+$/.test(raw)) return 0n;
		try {
			const v = BigInt(raw);
			if (v < 0n) return 0n;
			return v > U128_MAX ? U128_MAX : v;
		} catch {
			return 0n;
		}
	}
	if (typeof raw === "object" && raw !== null && "type" in raw && "value" in raw) {
		const o = raw as { type: string; value: unknown };
		if (o.type === "None") return 0n;
		return parseScaleU128(o.value);
	}
	return 0n;
}

/** Integer menu price for display (smallest on-chain unit). */
export function formatMenuPriceUnits(units: bigint): string {
	if (units < 0n) return "0";
	return units.toLocaleString();
}

export type ParsedMenuRow = { name: string; description: string; price: bigint };

/** Decode a `TemplatePallet::Restaurants` map value (on-chain `Restaurant`). */
export function parseRestaurantValue(raw: unknown): { venueName: string; menu: ParsedMenuRow[] } {
	if (raw === undefined || raw === null) {
		return { venueName: "", menu: [] };
	}
	let inner: unknown = raw;
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
			const row = item as { name?: unknown; description?: unknown; price?: unknown };
			menu.push({
				name: decodeUtf8Loose(toUint8Array(row.name)),
				description: decodeUtf8Loose(toUint8Array(row.description)),
				price: parseScaleU128(row.price),
			});
		}
	}
	return { venueName, menu };
}
