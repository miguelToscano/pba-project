import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "./useChain";

/**
 * On-chain TemplatePallet role flags for the connected account (Customer / Restaurant / Rider).
 * Call `refetch()` after local extrinsics that change roles (e.g. registration on Home).
 */
export function useAccountRoles() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const enabled = Boolean(address && connected && templatePallet === true);

	const query = useQuery({
		queryKey: ["accountRoles", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const [c, r, rider] = await Promise.all([
				api.query.TemplatePallet.Customers.getValue(address!),
				api.query.TemplatePallet.Restaurants.getValue(address!),
				api.query.TemplatePallet.Riders.getValue(address!),
			]);
			return {
				isCustomer: c !== undefined,
				isRestaurant: r !== undefined,
				isRider: rider !== undefined,
			};
		},
		enabled,
	});

	const resolved = enabled && query.isSuccess ? query.data : null;

	return {
		isCustomer: resolved?.isCustomer ?? null,
		isRestaurant: resolved?.isRestaurant ?? null,
		isRider: resolved?.isRider ?? null,
		/** True until the first successful fetch for the current account + chain (not refetches). */
		isLoading: enabled && !query.isFetched,
		isError: enabled && query.isFetched && query.isError,
		refetch: query.refetch,
	};
}
