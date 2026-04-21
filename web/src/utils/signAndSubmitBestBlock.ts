import type { PolkadotSigner } from "@polkadot-api/signer";
import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";

/**
 * Payload when the extrinsic is known to be included in a block (matches what
 * `Transaction.signAndSubmit` returns after finalization, minus waiting for finality).
 */
export type TxInclusionResult = {
	txHash: string;
	ok: boolean;
	events: unknown[];
	dispatchError?: unknown;
	block: { hash: string; number: number; index: number };
};

type TxWithWatch = {
	signSubmitAndWatch: (signer: PolkadotSigner) => import("rxjs").Observable<unknown>;
};

function isBestBlockFound(
	ev: unknown,
): ev is {
	type: "txBestBlocksState";
	found: true;
	txHash: string;
	ok: boolean;
	events: unknown[];
	dispatchError?: unknown;
	block: { hash: string; number: number; index: number };
} {
	if (!ev || typeof ev !== "object") return false;
	const o = ev as Record<string, unknown>;
	return o.type === "txBestBlocksState" && o.found === true;
}

/**
 * Sign, broadcast, and resolve as soon as the extrinsic appears in a **best** (non-finalized) block.
 *
 * Polkadot-API’s `signAndSubmit` waits for **finalized** inclusion, which on relay-backed
 * chains adds noticeable latency. For local dev and most UI flows, inclusion in the best
 * chain head is enough to read `System.ExtrinsicSuccess` / `ExtrinsicFailed` and events.
 */
export async function signAndSubmitAwaitBestBlock(
	tx: TxWithWatch,
	signer: PolkadotSigner,
): Promise<TxInclusionResult> {
	const ev = await firstValueFrom(tx.signSubmitAndWatch(signer).pipe(filter(isBestBlockFound)));
	return {
		txHash: ev.txHash,
		ok: ev.ok,
		events: ev.events,
		dispatchError: ev.dispatchError,
		block: ev.block,
	};
}
