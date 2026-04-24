import { useAccount as useLunoAccount, usePapiSigner } from "@luno-kit/react";
import { useHostAccountStore } from "../store/hostAccountStore";

/**
 * Unified account hook that returns the active account and signer regardless of
 * whether the connection came from a LunoKit browser-extension connector (standalone)
 * or a Spektr-injected host account (iframe / Nova Wallet webview).
 *
 * Drop-in replacement for the paired `useAccount()` + `usePapiSigner()` calls used
 * throughout the app.
 */
export function useActiveAccount() {
	const { address: lunoAddress } = useLunoAccount();
	const { data: lunoSigner, isLoading: signerLoading } = usePapiSigner();
	const hostAddress = useHostAccountStore((s) => s.address);
	const hostSigner = useHostAccountStore((s) => s.signer);

	if (lunoAddress) {
		return { address: lunoAddress, signer: lunoSigner ?? null, signerLoading };
	}
	return { address: hostAddress, signer: hostSigner, signerLoading: false };
}
