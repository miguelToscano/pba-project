import type { QueryClient } from "@tanstack/react-query";
import type { TxInclusionResult } from "./signAndSubmitBestBlock";
import {
	findLastEventPayloadByType,
	parseOrderPlacedFromTxEvents,
	parseOrderStatusChangedFromTxEvents,
	patchOrderStatusInRestaurantOrders,
	type RestaurantOrderRow,
} from "./templatePalletTxEvents";

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
	}

	const deliveryClaimed = findLastEventPayloadByType(events, "OrderDeliveryClaimed");
	if (statusChanged || deliveryClaimed) {
		void queryClient.invalidateQueries({
			queryKey: ["riderReadyPickupOrders"],
			exact: false,
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
