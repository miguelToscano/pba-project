/** One row in order list queries (`restaurantOrders` / `customerMyOrders`). */
export type RestaurantOrderRow = { id: bigint; order: unknown };

export function toOrderId(raw: unknown): bigint | null {
	if (typeof raw === "bigint") return raw;
	if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return BigInt(raw);
	if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);
	return null;
}

/**
 * Last payload object for a runtime event variant `type` (e.g. `OrderPlaced`), walking nested
 * polkadot-api Enum shapes.
 */
export function findLastEventPayloadByType(
	events: unknown,
	variantType: string,
): Record<string, unknown> | null {
	const hits: Record<string, unknown>[] = [];

	function walk(node: unknown, depth: number): void {
		if (depth > 16 || node === null || node === undefined) return;
		if (typeof node !== "object") return;

		if (Array.isArray(node)) {
			for (const x of node) walk(x, depth + 1);
			return;
		}

		const o = node as Record<string, unknown>;
		if (
			o.type === variantType &&
			o.value !== null &&
			typeof o.value === "object" &&
			!Array.isArray(o.value)
		) {
			hits.push(o.value as Record<string, unknown>);
		}

		for (const key of Object.keys(o)) {
			walk(o[key], depth + 1);
		}
	}

	walk(events, 0);
	if (hits.length === 0) return null;
	return hits[hits.length - 1]!;
}

export function parseOrderStatusChangedFromTxEvents(events: unknown): {
	orderId: bigint;
	status: unknown;
} | null {
	const v = findLastEventPayloadByType(events, "OrderStatusChanged");
	if (!v) return null;
	const orderId = toOrderId(v.order_id);
	if (orderId === null || !("status" in v)) return null;
	return { orderId, status: v.status };
}

export function parseOrderPlacedFromTxEvents(events: unknown): {
	orderId: bigint;
	customer: string;
	restaurant: string;
} | null {
	const v = findLastEventPayloadByType(events, "OrderPlaced");
	if (!v) return null;
	const orderId = toOrderId(v.order_id);
	const customer = typeof v.customer === "string" ? v.customer : null;
	const restaurant = typeof v.restaurant === "string" ? v.restaurant : null;
	if (orderId === null || !customer || !restaurant) return null;
	return { orderId, customer, restaurant };
}

/** Immutable update of one order's `status` in an orders query value. */
export function patchOrderStatusInRestaurantOrders(
	prev: RestaurantOrderRow[] | undefined,
	orderId: bigint,
	status: unknown,
): RestaurantOrderRow[] | undefined {
	if (!prev?.length) return prev;
	let touched = false;
	const next = prev.map((row) => {
		if (row.id !== orderId) return row;
		const order = row.order;
		if (!order || typeof order !== "object") return row;
		touched = true;
		return {
			...row,
			order: { ...(order as Record<string, unknown>), status },
		};
	});
	return touched ? next : prev;
}
