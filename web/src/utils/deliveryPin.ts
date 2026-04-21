import blake from "blakejs";

/**
 * Blake2b-256 over UTF-8 bytes of the PIN (32-byte digest).
 * Matches Substrate `sp_io::hashing::blake2_256` / `frame_support::hashing::blake2_256`.
 */
export function hashDeliveryPinBlake2_256(pin: string): Uint8Array {
	const input = new TextEncoder().encode(pin);
	return new Uint8Array(blake.blake2b(input, undefined, 32));
}

/** Uniform random 4-digit string `0000`–`9999`. */
export function randomDeliveryPin4(): string {
	const u = new Uint32Array(1);
	crypto.getRandomValues(u);
	const n = Number(u[0]! % 10_000);
	return String(n).padStart(4, "0");
}

export function deliveryPinStorageKey(
	wsUrl: string,
	accountAddress: string,
	orderId: bigint,
): string {
	return `pba.deliveryPin.v1:${wsUrl}:${accountAddress}:${orderId.toString()}`;
}

export function rememberDeliveryPin(
	wsUrl: string,
	accountAddress: string,
	orderId: bigint,
	pin: string,
): void {
	try {
		localStorage.setItem(deliveryPinStorageKey(wsUrl, accountAddress, orderId), pin);
	} catch {
		// ignore quota / private mode
	}
}

export function loadDeliveryPin(
	wsUrl: string,
	accountAddress: string,
	orderId: bigint,
): string | null {
	try {
		return localStorage.getItem(deliveryPinStorageKey(wsUrl, accountAddress, orderId));
	} catch {
		return null;
	}
}
