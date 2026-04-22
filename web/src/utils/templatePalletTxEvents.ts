/** One row in order list queries (`restaurantOrders` / `customerMyOrders`). */
export type RestaurantOrderRow = { id: bigint; order: unknown };

/** One row in the `riderReadyPickupOrders` query (flattened, no nested `order`). */
export type RiderReadyOrderRow = {
	id: bigint;
	customer: string;
	restaurant: string;
	assignedRider: string | null;
};

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

/**
 * Payload for the pallet's `OrderCompleted` event. Emitted by
 * `finish_order_delivery` once the rider's PIN has been verified and the
 * held payment has been split between the restaurant and the rider.
 */
export function parseOrderCompletedFromTxEvents(events: unknown): {
	orderId: bigint;
	restaurant: string;
	rider: string;
} | null {
	const v = findLastEventPayloadByType(events, "OrderCompleted");
	if (!v) return null;
	const orderId = toOrderId(v.order_id);
	const restaurant = typeof v.restaurant === "string" ? v.restaurant : null;
	const rider = typeof v.rider === "string" ? v.rider : null;
	if (orderId === null || !restaurant || !rider) return null;
	return { orderId, restaurant, rider };
}

/**
 * Payload for the pallet's `OrderDeliveryClaimed { order_id, rider }` event,
 * extracted from a tx inclusion result.
 */
export function parseOrderDeliveryClaimedFromTxEvents(events: unknown): {
	orderId: bigint;
	rider: string;
} | null {
	const v = findLastEventPayloadByType(events, "OrderDeliveryClaimed");
	if (!v) return null;
	const orderId = toOrderId(v.order_id);
	const rider = typeof v.rider === "string" ? v.rider : null;
	if (orderId === null || !rider) return null;
	return { orderId, rider };
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

/**
 * Immutable update of one order's `assigned_rider` in `restaurantOrders` /
 * `customerMyOrders` query values. `customerMyOrders` rows also carry a
 * row-level `assignedRider` derived once from `order.assigned_rider`; we keep
 * both in sync so the UI updates without another storage round-trip.
 */
export function patchOrderAssignedRiderInOrdersLists(
	prev: RestaurantOrderRow[] | undefined,
	orderId: bigint,
	rider: string,
): RestaurantOrderRow[] | undefined {
	if (!prev?.length) return prev;
	let touched = false;
	const next = prev.map((row) => {
		if (row.id !== orderId) return row;
		const order = row.order;
		if (!order || typeof order !== "object") return row;
		touched = true;
		const patched: Record<string, unknown> = {
			...row,
			order: {
				...(order as Record<string, unknown>),
				assigned_rider: { type: "Some", value: rider },
			},
		};
		if ("assignedRider" in (row as Record<string, unknown>)) {
			patched.assignedRider = rider;
		}
		return patched as RestaurantOrderRow;
	});
	return touched ? next : prev;
}

/**
 * Immutable update of one row's `assignedRider` in the flat
 * `riderReadyPickupOrders` query value (no nested `order` on these rows).
 */
export function patchAssignedRiderInRiderReadyOrders(
	prev: RiderReadyOrderRow[] | undefined,
	orderId: bigint,
	rider: string,
): RiderReadyOrderRow[] | undefined {
	if (!prev?.length) return prev;
	let touched = false;
	const next = prev.map((row) => {
		if (row.id !== orderId) return row;
		touched = true;
		return { ...row, assignedRider: rider };
	});
	return touched ? next : prev;
}

/**
 * Drop one order from the rider's "Available Orders" cache. Used when the
 * signer's tx emits `OrderStatusChanged` with a status other than
 * `ReadyForPickup` (currently only `confirm_delivery_pickup`, which moves
 * the order to `OnItsWay`), so the row leaves the list without waiting
 * for a storage refetch.
 */
export function removeOrderFromRiderReadyOrders(
	prev: RiderReadyOrderRow[] | undefined,
	orderId: bigint,
): RiderReadyOrderRow[] | undefined {
	if (!prev?.length) return prev;
	const next = prev.filter((row) => row.id !== orderId);
	return next.length === prev.length ? prev : next;
}
