import type { QueryClient } from "@tanstack/react-query";
import type { TxInclusionResult } from "./signAndSubmitBestBlock";
import {
	findLastEventPayloadByType,
	parseOrderDeliveryClaimedFromTxEvents,
	parseOrderPlacedFromTxEvents,
	parseOrderStatusChangedFromTxEvents,
	patchAssignedRiderInRiderReadyOrders,
	patchOrderAssignedRiderInOrdersLists,
	patchOrderStatusInRestaurantOrders,
	removeOrderFromRiderReadyOrders,
	type RestaurantOrderRow,
	type RiderReadyOrderRow,
} from "./templatePalletTxEvents";
import { orderStatusVariant } from "./orderCodec";

export type ApplyTemplatePalletTxContext = {
	queryClient: QueryClient;
	wsUrl: string;
	/** SS58 of the signing account (role txs + customer order flow). */
	walletAddress?: string;
};

/**
 * After a successful `TemplatePallet` extrinsic, update React Query caches from **emitted events**
 * where possible; otherwise use targeted invalidation.
 */
export function applyTemplatePalletTxToQueryCache(
	ctx: ApplyTemplatePalletTxContext,
	result: Pick<TxInclusionResult, "events">,
): void {
	const { queryClient, wsUrl, walletAddress } = ctx;
	const { events } = result;

	const statusChanged = parseOrderStatusChangedFromTxEvents(events);
	if (statusChanged) {
		queryClient.setQueriesData({ queryKey: ["restaurantOrders"], exact: false }, (prev) =>
			patchOrderStatusInRestaurantOrders(
				prev as RestaurantOrderRow[] | undefined,
				statusChanged.orderId,
				statusChanged.status,
			),
		);
		queryClient.setQueriesData({ queryKey: ["customerMyOrders"], exact: false }, (prev) =>
			patchOrderStatusInRestaurantOrders(
				prev as RestaurantOrderRow[] | undefined,
				statusChanged.orderId,
				statusChanged.status,
			),
		);
		// Update the rider's "Available Orders" list based on the new status:
		//  - Leaving `ReadyForPickup` (currently only `confirm_delivery_pickup`):
		//    drop the row in place from the cache so the rider's UI updates
		//    instantly after "Mark on its way".
		//  - Entering `ReadyForPickup` (restaurant's `advance_order_status`):
		//    we don't have the full row payload in the event, so refetch.
		if (orderStatusVariant(statusChanged.status) !== "ReadyForPickup") {
			queryClient.setQueriesData(
				{ queryKey: ["riderReadyPickupOrders"], exact: false },
				(prev) =>
					removeOrderFromRiderReadyOrders(
						prev as RiderReadyOrderRow[] | undefined,
						statusChanged.orderId,
					),
			);
		} else {
			void queryClient.invalidateQueries({
				queryKey: ["riderReadyPickupOrders"],
				exact: false,
			});
		}
	}

	const deliveryClaimed = parseOrderDeliveryClaimedFromTxEvents(events);
	if (deliveryClaimed) {
		// Patch restaurant / customer order lists so the "Chat" affordance on
		// those views flips on immediately for the signer (the rider), without
		// a storage round-trip.
		queryClient.setQueriesData({ queryKey: ["restaurantOrders"], exact: false }, (prev) =>
			patchOrderAssignedRiderInOrdersLists(
				prev as RestaurantOrderRow[] | undefined,
				deliveryClaimed.orderId,
				deliveryClaimed.rider,
			),
		);
		queryClient.setQueriesData({ queryKey: ["customerMyOrders"], exact: false }, (prev) =>
			patchOrderAssignedRiderInOrdersLists(
				prev as RestaurantOrderRow[] | undefined,
				deliveryClaimed.orderId,
				deliveryClaimed.rider,
			),
		);
		// Rider's "Available Orders" list uses a flat row shape.
		queryClient.setQueriesData({ queryKey: ["riderReadyPickupOrders"], exact: false }, (prev) =>
			patchAssignedRiderInRiderReadyOrders(
				prev as RiderReadyOrderRow[] | undefined,
				deliveryClaimed.orderId,
				deliveryClaimed.rider,
			),
		);
		// Pre-seed the chat window's per-order query so opening the chat right
		// after a claim doesn't have to wait for its 8s poll to discover the rider.
		const chatKey = ["chatOrder", wsUrl, deliveryClaimed.orderId.toString()] as const;
		type ChatOrder = { customer: string | null; rider: string | null };
		const prevChat = queryClient.getQueryData<ChatOrder>(chatKey);
		queryClient.setQueryData<ChatOrder>(chatKey, {
			customer: prevChat?.customer ?? null,
			rider: deliveryClaimed.rider,
		});
	}

	const placed = parseOrderPlacedFromTxEvents(events);
	if (placed) {
		void queryClient.invalidateQueries({
			queryKey: ["customerMyOrders", placed.customer, wsUrl],
		});
		void queryClient.invalidateQueries({
			queryKey: ["restaurantOrders", placed.restaurant, wsUrl],
		});
	}

	if (!walletAddress) return;

	// Every tx pays a fee, so the signer's free balance always changes.
	// Invalidate the balance query so the role-panel balance badge refreshes
	// promptly without waiting for the query's staleTime to elapse.
	void queryClient.invalidateQueries({
		queryKey: ["accountBalance", walletAddress, wsUrl],
	});

	const rolesKey = ["accountRoles", walletAddress, wsUrl] as const;
	type Roles = { isCustomer: boolean; isRestaurant: boolean; isRider: boolean };

	const patchRole = (field: keyof Roles) => {
		const prev = queryClient.getQueryData<Roles>(rolesKey);
		if (prev) {
			queryClient.setQueryData(rolesKey, { ...prev, [field]: true });
		} else {
			void queryClient.invalidateQueries({ queryKey: [...rolesKey] });
		}
	};

	const customerCreated = findLastEventPayloadByType(events, "CustomerCreated");
	if (
		customerCreated &&
		typeof customerCreated.who === "string" &&
		customerCreated.who === walletAddress
	) {
		patchRole("isCustomer");
	}

	const restaurantCreated = findLastEventPayloadByType(events, "RestaurantCreated");
	if (
		restaurantCreated &&
		typeof restaurantCreated.who === "string" &&
		restaurantCreated.who === walletAddress
	) {
		patchRole("isRestaurant");
		void queryClient.invalidateQueries({ queryKey: ["customerRestaurantsList", wsUrl] });
		void queryClient.invalidateQueries({
			queryKey: ["homeRestaurantProfile", walletAddress, wsUrl],
		});
	}

	const riderCreated = findLastEventPayloadByType(events, "RiderCreated");
	if (
		riderCreated &&
		typeof riderCreated.who === "string" &&
		riderCreated.who === walletAddress
	) {
		patchRole("isRider");
	}
}
