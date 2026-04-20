import { useEffect, useState } from "react";
import { useAccount } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "../hooks/useChain";

/**
 * Read-only field showing whether the connected LunoKit account is registered
 * as Customer / Restaurant / Rider in node storage. Refetches when the account
 * or chain head changes.
 */
export default function AccountRoleField() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const blockNumber = useChainStore((s) => s.blockNumber);
	const [value, setValue] = useState("—");

	useEffect(() => {
		let cancelled = false;

		async function run() {
			if (!address) {
				setValue("—");
				return;
			}
			if (!connected) {
				setValue("RPC off");
				return;
			}
			if (templatePallet !== true) {
				setValue(templatePallet === false ? "No pallet" : "…");
				return;
			}

			setValue("Loading…");
			try {
				const api = getClient(wsUrl).getTypedApi(stack_template);
				const [c, r, rider] = await Promise.all([
					api.query.TemplatePallet.Customers.getValue(address),
					api.query.TemplatePallet.Restaurants.getValue(address),
					api.query.TemplatePallet.Riders.getValue(address),
				]);
				if (cancelled) return;
				const parts: string[] = [];
				if (c !== undefined) parts.push("Customer");
				if (r !== undefined) parts.push("Restaurant");
				if (rider !== undefined) parts.push("Rider");
				setValue(parts.length > 0 ? parts.join(" / ") : "None");
			} catch {
				if (!cancelled) setValue("Error");
			}
		}

		void run();
		return () => {
			cancelled = true;
		};
	}, [address, connected, wsUrl, templatePallet, blockNumber]);

	return (
		<div className="hidden sm:flex flex-col gap-1 min-w-0 w-[min(14rem,40vw)] max-w-[14rem] shrink">
			<label htmlFor="account-role-display" className="label text-[10px] mb-0 leading-tight truncate">
				Customer / Restaurant / Rider
			</label>
			<input
				id="account-role-display"
				type="text"
				readOnly
				value={value}
				title={value}
				className="input-field text-xs py-1.5 px-2 h-8 cursor-default"
				aria-live="polite"
			/>
		</div>
	);
}
