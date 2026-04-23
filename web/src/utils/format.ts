/// Format a PAPI dispatch error into a human-readable string.
export function formatDispatchError(err: unknown): string {
	if (!err) return "Transaction failed";
	const e = err as { type?: string; value?: { type?: string; value?: { type?: string } } };
	if (e.type === "Module" && e.value) {
		const mod = e.value;
		return `${mod.type}.${mod.value?.type ?? ""}`.replace(/:?\s*$/, "");
	}
	return JSON.stringify(err);
}

/**
 * Chain native token symbol used in the frontend display.
 * Mirrors `UNIT` in `blockchain/runtime/src/lib.rs`.
 */
export const TOKEN_SYMBOL = "UNIT";

/** No sub-unit decimals: 1 UNIT = 1 planck. Stored value = displayed value. */
export const TOKEN_DECIMALS = 0;

const TOKEN_SCALE = 10n ** BigInt(TOKEN_DECIMALS);

/**
 * Format a raw planck balance (smallest unit, u128) into a human-readable
 * decimal string with up to 4 fractional digits and trailing zeros stripped.
 */
export function formatBalance(planck: bigint, maxFractionDigits = 4): string {
	const negative = planck < 0n;
	const abs = negative ? -planck : planck;
	const whole = abs / TOKEN_SCALE;
	const frac = abs % TOKEN_SCALE;
	let out = whole.toLocaleString();
	if (frac > 0n) {
		const fracStr = frac
			.toString()
			.padStart(TOKEN_DECIMALS, "0")
			.slice(0, Math.max(0, maxFractionDigits))
			.replace(/0+$/, "");
		if (fracStr.length > 0) out = `${out}.${fracStr}`;
	}
	return negative ? `-${out}` : out;
}
