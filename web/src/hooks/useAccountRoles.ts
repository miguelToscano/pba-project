import { useQuery } from "@tanstack/react-query";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "./useChain";
import { useActiveAccount } from "./useActiveAccount";

/**
 * On-chain TemplatePallet role flags for the connected account (Customer / Restaurant / Rider).
 * Call `refetch()` after local extrinsics that change roles (e.g. registration on Home).
 */
export function useAccountRoles() {
	const { address } = useActiveAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const enabled = Boolean(address && connected && templatePallet === true);

	const query = useQuery({
		queryKey: ["accountRoles", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const [c, r, rider] = await Promise.all([
				api.query.TemplatePallet.Customers.getValue(address!, { at: "best" }),
				api.query.TemplatePallet.Restaurants.getValue(address!, { at: "best" }),
				api.query.TemplatePallet.Riders.getValue(address!, { at: "best" }),
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
