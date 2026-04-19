import { createConfig, createStorage } from "@luno-kit/react";
import { kusama, paseo, polkadot, westend } from "@luno-kit/react/chains";
import {
	polkadotjsConnector,
	subwalletConnector,
	talismanConnector,
} from "@luno-kit/react/connectors";

/**
 * LunoKit wallet configuration (browser extension connectors + known relay chains).
 * Transports are derived from each chain's RPC URLs in @luno-kit/core.
 */
export const lunokitConfig = createConfig({
	appName: "Polkadot Stack Template",
	chains: [polkadot, kusama, paseo, westend],
	connectors: [polkadotjsConnector(), subwalletConnector(), talismanConnector()],
	autoConnect: true,
	storage: createStorage({ storage: localStorage }),
});
