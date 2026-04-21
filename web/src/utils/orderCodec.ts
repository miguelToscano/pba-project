import type { ParsedMenuRow } from "./restaurantCodec";

/** Decode `OrderStatus` / anonymous enum from storage into a variant name. */
export function orderStatusVariant(status: unknown): string {
	if (status === null || status === undefined) return "—";
	if (typeof status === "object" && "type" in status) {
		const t = (status as { type: unknown }).type;
		if (typeof t === "string") return t;
	}
	return "—";
}

const STATUS_DISPLAY: Record<string, string> = {
	Created: "Created",
	InProgress: "In progress",
	ReadyForPickup: "Ready for pickup",
	OnItsWay: "On its way",
};

export function orderStatusDisplay(status: unknown): string {
	const v = orderStatusVariant(status);
	return STATUS_DISPLAY[v] ?? v;
}

const ADVANCE_LABEL: Record<string, string> = {
	Created: "Mark in progress",
	InProgress: "Mark ready for pickup",
	ReadyForPickup: "Mark on its way",
};

export function nextAdvanceActionLabel(status: unknown): string | null {
	const v = orderStatusVariant(status);
	if (v === "OnItsWay") return null;
	return ADVANCE_LABEL[v] ?? "Advance status";
}

/** Human-readable line summary using menu labels when available. */
export function formatOrderLinesSummary(lines: unknown, menu: ParsedMenuRow[]): string {
	if (!Array.isArray(lines) || lines.length === 0) return "—";
	const parts: string[] = [];
	for (const line of lines) {
		const rec = line as { menu_index?: unknown; quantity?: unknown };
		const idx = typeof rec.menu_index === "number" ? rec.menu_index : Number(rec.menu_index);
		const qty = typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity);
		const label =
			Number.isInteger(idx) && idx >= 0 && idx < menu.length
				? menu[idx]!.name || `Item ${idx}`
				: `#${idx}`;
		parts.push(`${qty}× ${label}`);
	}
	return parts.join(", ");
}
