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

/**
 * Labels the *restaurant* uses to advance an order. Deliberately stops at
 * `InProgress → ReadyForPickup`: the pallet rejects `advance_order_status`
 * past `ReadyForPickup` (that transition is the rider's `confirm_delivery_pickup`),
 * so showing a button on either of those states would always fail on-chain.
 */
const RESTAURANT_ADVANCE_LABEL: Record<string, string> = {
	Created: "Mark in progress",
	InProgress: "Mark ready for pickup",
};

export function nextAdvanceActionLabel(status: unknown): string | null {
	const v = orderStatusVariant(status);
	return RESTAURANT_ADVANCE_LABEL[v] ?? null;
}

/**
 * What the restaurant sees in the Action column when there is no button to
 * press — either the rider must pick up the order, or the order has already
 * left the kitchen.
 */
export function restaurantTerminalActionLabel(status: unknown): string | null {
	const v = orderStatusVariant(status);
	if (v === "ReadyForPickup") return "Awaiting rider pickup";
	if (v === "OnItsWay") return "Handed over to rider";
	return null;
}

function parseLineIndexAndQty(line: unknown): { idx: number; qty: number } | null {
	if (line === null || typeof line !== "object") return null;
	const rec = line as { menu_index?: unknown; quantity?: unknown };
	const idx = typeof rec.menu_index === "number" ? rec.menu_index : Number(rec.menu_index);
	const qty = typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity);
	if (!Number.isInteger(idx) || idx < 0 || !Number.isInteger(qty) || qty < 0) return null;
	return { idx, qty };
}

export type OrderLineDetail = {
	name: string;
	quantity: number;
	unitPrice: bigint;
	lineTotal: bigint;
};

/** Per-line names, quantities, unit price, line total, and order total (smallest units). */
export function orderLinesWithPricing(
	lines: unknown,
	menu: ParsedMenuRow[],
): { lines: OrderLineDetail[]; total: bigint } {
	if (!Array.isArray(lines) || lines.length === 0) return { lines: [], total: 0n };
	const out: OrderLineDetail[] = [];
	let total = 0n;
	for (const line of lines) {
		const parsed = parseLineIndexAndQty(line);
		if (!parsed || parsed.qty === 0) continue;
		const { idx, qty } = parsed;
		const row = Number.isInteger(idx) && idx >= 0 && idx < menu.length ? menu[idx]! : null;
		const name = row?.name && row.name.length > 0 ? row.name : `Item #${idx}`;
		const unitPrice = row?.price ?? 0n;
		const lineTotal = unitPrice * BigInt(qty);
		total += lineTotal;
		out.push({ name, quantity: qty, unitPrice, lineTotal });
	}
	return { lines: out, total };
}

/** Human-readable line summary using menu labels when available. */
export function formatOrderLinesSummary(lines: unknown, menu: ParsedMenuRow[]): string {
	if (!Array.isArray(lines) || lines.length === 0) return "—";
	const parts: string[] = [];
	for (const line of lines) {
		const parsed = parseLineIndexAndQty(line);
		if (!parsed || parsed.qty === 0) continue;
		const { idx, qty } = parsed;
		const label =
			Number.isInteger(idx) && idx >= 0 && idx < menu.length
				? menu[idx]!.name || `Item ${idx}`
				: `#${idx}`;
		parts.push(`${qty}× ${label}`);
	}
	return parts.length ? parts.join(", ") : "—";
}
