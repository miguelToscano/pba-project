import { create } from "zustand";
import type { PolkadotSigner } from "@polkadot-api/signer";

interface HostAccountState {
	address: string | null;
	signer: PolkadotSigner | null;
	setAccount: (address: string, signer: PolkadotSigner) => void;
	clear: () => void;
}

export const useHostAccountStore = create<HostAccountState>((set) => ({
	address: null,
	signer: null,
	setAccount: (address, signer) => set({ address, signer }),
	clear: () => set({ address: null, signer: null }),
}));
