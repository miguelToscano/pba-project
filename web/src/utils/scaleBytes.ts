/** Normalize pallet `BoundedVec<u8>` / `Binary` fields to `Uint8Array` for decoding. */
export function toUint8Array(value: unknown): Uint8Array {
	if (value instanceof Uint8Array) return value;
	if (Array.isArray(value)) return Uint8Array.from(value);
	if (value !== null && typeof value === "object" && "asBytes" in value) {
		const fn = (value as { asBytes?: () => Uint8Array }).asBytes;
		if (typeof fn === "function") return fn.call(value);
	}
	return new Uint8Array();
}

export function decodeUtf8Loose(bytes: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	} catch {
		return "";
	}
}
