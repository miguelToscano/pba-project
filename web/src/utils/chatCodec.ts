import { blake2b256, ss58Decode, sr25519 } from "@polkadot-labs/hdkd-helpers";

/** App namespace topic. Together with the per-order topic this scopes
 *  `statement_broadcastsStatement` to a single chat thread.
 */
const CHAT_NS_SEED = new TextEncoder().encode("pba/chat/v1");
export const CHAT_NS = blake2b256(CHAT_NS_SEED);

/**
 * Deterministic per-order topic. Uses a literal prefix so we never collide
 * with other `order_id`-keyed topics a different feature might introduce.
 */
export function orderTopic(orderId: bigint): Uint8Array {
	const prefix = new TextEncoder().encode("pba/chat/order/");
	const leBytes = new Uint8Array(8);
	const view = new DataView(leBytes.buffer);
	view.setBigUint64(0, orderId, true);
	const seed = new Uint8Array(prefix.length + 8);
	seed.set(prefix, 0);
	seed.set(leBytes, prefix.length);
	return blake2b256(seed);
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
	return ("0x" +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")) as `0x${string}`;
}

export function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export function ss58ToPublicKey(address: string): Uint8Array {
	const [payload] = ss58Decode(address);
	if (payload.length !== 32) {
		throw new Error(`Expected 32-byte ss58 public key, got ${payload.length}.`);
	}
	return payload;
}

// ---------------------------------------------------------------------------
// ChatEnvelope SCALE codec
// ---------------------------------------------------------------------------
//
// enum ChatEnvelope {
//     Delegation {                          // variant 0
//         real_account:     [u8; 32],
//         ephemeral_pub:    [u8; 32],
//         expires_at_ms:    u64,            // LE
//         wallet_signature: [u8; 64],
//     },
//     Message {                             // variant 1
//         sent_at_ms: u64,                  // LE
//         body:       Vec<u8>,              // compact-prefixed utf-8
//     },
// }
//
// We hand-roll the SCALE shape since the whole app uses that approach already
// (see `utils/orderCodec.ts`) and we don't need the full `polkadot-api` codec
// machinery just for two tiny variants.

export const MAX_CHAT_BODY_BYTES = 2048;
export const MAX_CHAT_ENVELOPE_BYTES = 4096; // paranoid upper bound

const VARIANT_DELEGATION = 0;
const VARIANT_MESSAGE = 1;

export interface ChatDelegation {
	kind: "delegation";
	realAccount: Uint8Array; // 32 bytes
	ephemeralPub: Uint8Array; // 32 bytes
	expiresAtMs: bigint;
	walletSignature: Uint8Array; // 64 bytes
}

export interface ChatMessage {
	kind: "message";
	sentAtMs: bigint;
	body: Uint8Array; // utf-8
}

export type ChatEnvelope = ChatDelegation | ChatMessage;

function writeU64LE(view: DataView, offset: number, value: bigint): void {
	view.setBigUint64(offset, value, true);
}

function readU64LE(view: DataView, offset: number): bigint {
	return view.getBigUint64(offset, true);
}

/**
 * Minimal compact-integer encoder covering the lengths we need (body ≤ 4 KiB,
 * so the 1- and 2-byte modes are the only ones exercised in practice).
 */
function encodeCompactU32(n: number): Uint8Array {
	if (n < 0) throw new Error("Compact integers must be non-negative");
	if (n <= 0b0011_1111) return new Uint8Array([n << 2]);
	if (n <= 0b0011_1111_1111_1111) {
		const v = (n << 2) | 0b01;
		return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
	}
	const v = (n << 2) | 0b10;
	return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

function decodeCompactU32(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
	const first = bytes[offset];
	const mode = first & 0b11;
	if (mode === 0) return { value: first >> 2, bytesRead: 1 };
	if (mode === 1) {
		return { value: ((bytes[offset + 1] << 8) | first) >> 2, bytesRead: 2 };
	}
	if (mode === 2) {
		const v =
			((bytes[offset + 3] << 24) |
				(bytes[offset + 2] << 16) |
				(bytes[offset + 1] << 8) |
				first) >>>
			2;
		return { value: v, bytesRead: 4 };
	}
	throw new Error("Unsupported compact big-int mode in chat envelope");
}

export function encodeChatEnvelope(env: ChatEnvelope): Uint8Array {
	if (env.kind === "delegation") {
		if (env.realAccount.length !== 32) throw new Error("realAccount must be 32 bytes");
		if (env.ephemeralPub.length !== 32) throw new Error("ephemeralPub must be 32 bytes");
		if (env.walletSignature.length !== 64) throw new Error("walletSignature must be 64 bytes");
		const out = new Uint8Array(1 + 32 + 32 + 8 + 64);
		const view = new DataView(out.buffer);
		out[0] = VARIANT_DELEGATION;
		out.set(env.realAccount, 1);
		out.set(env.ephemeralPub, 33);
		writeU64LE(view, 65, env.expiresAtMs);
		out.set(env.walletSignature, 73);
		return out;
	}
	if (env.body.length > MAX_CHAT_BODY_BYTES) {
		throw new Error(`Chat body too large (${env.body.length}B > ${MAX_CHAT_BODY_BYTES}B).`);
	}
	const lenPrefix = encodeCompactU32(env.body.length);
	const out = new Uint8Array(1 + 8 + lenPrefix.length + env.body.length);
	const view = new DataView(out.buffer);
	out[0] = VARIANT_MESSAGE;
	writeU64LE(view, 1, env.sentAtMs);
	out.set(lenPrefix, 9);
	out.set(env.body, 9 + lenPrefix.length);
	return out;
}

export function decodeChatEnvelope(bytes: Uint8Array): ChatEnvelope | null {
	if (bytes.length === 0) return null;
	const variant = bytes[0];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	try {
		if (variant === VARIANT_DELEGATION) {
			if (bytes.length < 1 + 32 + 32 + 8 + 64) return null;
			return {
				kind: "delegation",
				realAccount: bytes.slice(1, 33),
				ephemeralPub: bytes.slice(33, 65),
				expiresAtMs: readU64LE(view, 65),
				walletSignature: bytes.slice(73, 137),
			};
		}
		if (variant === VARIANT_MESSAGE) {
			if (bytes.length < 1 + 8 + 1) return null;
			const sentAtMs = readU64LE(view, 1);
			const { value: bodyLen, bytesRead } = decodeCompactU32(bytes, 9);
			const bodyStart = 9 + bytesRead;
			if (bytes.length < bodyStart + bodyLen) return null;
			return {
				kind: "message",
				sentAtMs,
				body: bytes.slice(bodyStart, bodyStart + bodyLen),
			};
		}
		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Wallet-signed delegation: canonical message + verification
// ---------------------------------------------------------------------------

/**
 * Deterministic human-readable delegation payload that the real wallet signs.
 * Kept as ASCII/newlines so polkadot-js / Talisman / Subwallet render it in
 * their confirmation modals instead of opaque hex.
 */
export function buildDelegationCanonicalMessage(args: {
	orderId: bigint;
	ephemeralPub: Uint8Array;
	expiresAtMs: bigint;
}): string {
	return [
		"PBA-CHAT-DELEGATION",
		`order=${args.orderId.toString()}`,
		`ephemeral=${bytesToHex(args.ephemeralPub)}`,
		`expires=${args.expiresAtMs.toString()}`,
	].join("\n");
}

const BYTES_OPEN = new TextEncoder().encode("<Bytes>");
const BYTES_CLOSE = new TextEncoder().encode("</Bytes>");

/**
 * Polkadot extensions (polkadot-js, Talisman, Subwallet) all wrap
 * `signRaw({ type: "bytes" })` payloads with `<Bytes>…</Bytes>` before
 * signing, to ensure users can never accidentally sign a real transaction
 * blob. Reconstruct that exact wrapping for off-chain verification.
 */
export function wrapBytesForWalletSig(payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(BYTES_OPEN.length + payload.length + BYTES_CLOSE.length);
	out.set(BYTES_OPEN, 0);
	out.set(payload, BYTES_OPEN.length);
	out.set(BYTES_CLOSE, BYTES_OPEN.length + payload.length);
	return out;
}

/**
 * Verify that `signature` is a valid sr25519 signature by `realAccount` over
 * the `<Bytes>…</Bytes>`-wrapped canonical delegation message for this order.
 *
 * Some extensions historically prefixed the signature with a 1-byte curve tag;
 * fall back to stripping it before re-verifying to stay compatible.
 */
export function verifyDelegationSignature(args: {
	orderId: bigint;
	delegation: ChatDelegation;
}): boolean {
	const { orderId, delegation } = args;
	const now = BigInt(Date.now());
	if (delegation.expiresAtMs <= now) return false;

	const canonical = new TextEncoder().encode(
		buildDelegationCanonicalMessage({
			orderId,
			ephemeralPub: delegation.ephemeralPub,
			expiresAtMs: delegation.expiresAtMs,
		}),
	);
	const wrapped = wrapBytesForWalletSig(canonical);

	const tryVerify = (sig: Uint8Array) => {
		try {
			return sr25519.verify(sig, wrapped, delegation.realAccount);
		} catch {
			return false;
		}
	};

	if (tryVerify(delegation.walletSignature)) return true;
	// Fallback: some wallet builds ship a 1-byte curve prefix on the signature.
	if (delegation.walletSignature.length === 65) {
		return tryVerify(delegation.walletSignature.slice(1));
	}
	return false;
}
