import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "./useChain";

/**
 * Native `System.Account` balance + nonce for the connected account.
 * Returns `free`/`reserved` as `bigint` in planck (smallest units).
 *
 * Re-queries when wallet address or RPC endpoint change. Short stale time so
 * the pill refreshes after txs (order placement, registration fees, etc.)
 * without requiring a full RPC subscription.
 */
export function useAccountBalance() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const enabled = Boolean(address && connected);

	const query = useQuery({
		queryKey: ["accountBalance", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const info = await api.query.System.Account.getValue(address!);
			return {
				free: info.data.free as bigint,
				reserved: info.data.reserved as bigint,
				nonce: info.nonce,
			};
		},
		enabled,
		staleTime: 5_000,
		refetchOnWindowFocus: true,
	});

	return {
		free: enabled && query.isSuccess ? query.data.free : null,
		reserved: enabled && query.isSuccess ? query.data.reserved : null,
		nonce: enabled && query.isSuccess ? query.data.nonce : null,
		isLoading: enabled && !query.isFetched,
		isError: enabled && query.isFetched && query.isError,
		refetch: query.refetch,
	};
}
