import { Bytes, compact, u8 } from "@polkadot-api/substrate-bindings";
import { blake2b } from "blakejs";

const MAX_STATEMENT_STORE_ENCODED_SIZE = 1024 * 1024 - 1;
const FIELD_TAG_AUTH = 0;
const FIELD_TAG_PLAIN_DATA = 8;
const PROOF_VARIANT_SR25519 = 0;

// Field discriminants from sp_statement_store::Field (stable2512-3)
const FIELD_AUTHENTICITY_PROOF = 0;
const FIELD_DECRYPTION_KEY = 1;
const FIELD_PRIORITY = 2;
const FIELD_CHANNEL = 3;
const FIELD_TOPIC1 = 4;
const FIELD_TOPIC2 = 5;
const FIELD_TOPIC3 = 6;
const FIELD_TOPIC4 = 7;
const FIELD_DATA = 8;

// Proof variants
const PROOF_SR25519 = 0;
const PROOF_ED25519 = 1;

const encodeVecU8 = Bytes.enc();

function concatBytes(parts: Uint8Array[]): Uint8Array {
	const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(totalLen);
	let offset = 0;

	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}

	return result;
}

function ensureFixedLength(value: Uint8Array, length: number, label: string): void {
	if (value.length !== length) {
		throw new Error(`${label} must be ${length} bytes, got ${value.length}`);
	}
}

function encodeSr25519Proof(publicKey: Uint8Array, signature: Uint8Array): Uint8Array {
	ensureFixedLength(publicKey, 32, "Statement Store public key");
	ensureFixedLength(signature, 64, "Statement Store signature");

	return concatBytes([u8.enc(PROOF_VARIANT_SR25519), signature, publicKey]);
}

function encodeDataField(data: Uint8Array): Uint8Array {
	return concatBytes([u8.enc(FIELD_TAG_PLAIN_DATA), encodeVecU8(data)]);
}

function encodeProofField(publicKey: Uint8Array, signature: Uint8Array): Uint8Array {
	return concatBytes([u8.enc(FIELD_TAG_AUTH), encodeSr25519Proof(publicKey, signature)]);
}

function encodeTopicField(tag: number, topic: Uint8Array): Uint8Array {
	ensureFixedLength(topic, 32, "Statement Store topic");
	return concatBytes([u8.enc(tag), topic]);
}

function encodePriorityField(priority: number): Uint8Array {
	if (!Number.isInteger(priority) || priority < 0 || priority > 0xffff_ffff) {
		throw new Error(
			`Statement Store priority must fit in u32, got ${priority} (${typeof priority}).`,
		);
	}
	const buf = new Uint8Array(4);
	new DataView(buf.buffer).setUint32(0, priority, true);
	return concatBytes([u8.enc(FIELD_PRIORITY), buf]);
}

/**
 * Build the signature payload for a Statement Store statement — the canonical
 * `Statement::encoded(true)` omits the authenticity proof but includes every
 * other field in ascending discriminant order (Priority=2, Topic1..4=4..7,
 * Data=8).
 */
function buildSignaturePayloadWithTopics(
	topics: readonly Uint8Array[],
	data: Uint8Array,
	priority?: number,
): Uint8Array {
	const parts: Uint8Array[] = [];
	if (priority !== undefined) parts.push(encodePriorityField(priority));
	topics.slice(0, 4).forEach((topic, i) => {
		parts.push(encodeTopicField(FIELD_TOPIC1 + i, topic));
	});
	parts.push(encodeDataField(data));
	return concatBytes(parts);
}

function buildSignedStatement(
	data: Uint8Array,
	publicKey: Uint8Array,
	signature: Uint8Array,
	topics: readonly Uint8Array[] = [],
	priority?: number,
): Uint8Array {
	const bodyParts: Uint8Array[] = [encodeProofField(publicKey, signature)];
	if (priority !== undefined) bodyParts.push(encodePriorityField(priority));
	topics.slice(0, 4).forEach((topic, i) => {
		bodyParts.push(encodeTopicField(FIELD_TOPIC1 + i, topic));
	});
	bodyParts.push(encodeDataField(data));
	const numFields = bodyParts.length;
	return concatBytes([compact.enc(numFields), ...bodyParts]);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Convert a ws:// or wss:// URL to http:// or https:// for JSON-RPC POST.
 */
function wsToHttp(wsUrl: string): string {
	return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

/**
 * Check if the node exposes the Statement Store RPC methods.
 */
export async function checkStatementStoreAvailable(wsUrl: string): Promise<boolean> {
	const httpUrl = wsToHttp(wsUrl);
	try {
		const response = await fetch(httpUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "rpc_methods",
				params: [],
			}),
		});
		const result = await response.json();
		const methods: string[] = result?.result?.methods ?? [];
		return methods.includes("statement_submit") && methods.includes("statement_dump");
	} catch {
		return false;
	}
}

/**
 * Submit file bytes to the local node's Statement Store.
 *
 * Builds a canonical SCALE-encoded sp_statement_store::Statement and
 * calls the `statement_submit` JSON-RPC method via HTTP POST.
 */
export async function submitToStatementStore(
	wsUrl: string,
	fileBytes: Uint8Array,
	publicKey: Uint8Array,
	sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): Promise<void> {
	await submitSignedStatement(wsUrl, {
		data: fileBytes,
		publicKey,
		sign,
	});
}

/**
 * Submit an arbitrary signed statement with up-to-four topic tags.
 *
 * The caller provides the raw data payload, their sr25519 public key, and a
 * `sign` callback that produces a raw 64-byte sr25519 signature over whatever
 * bytes are handed to it (i.e. not wrapped with `<Bytes>…</Bytes>`). That is
 * the shape Statement Store requires — browser wallet extensions cannot
 * produce it directly, so callers typically use an ephemeral local keypair.
 */
export async function submitSignedStatement(
	wsUrl: string,
	args: {
		data: Uint8Array;
		publicKey: Uint8Array;
		sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
		topics?: readonly Uint8Array[];
		/**
		 * Optional `u32` priority used by the node's statement eviction logic.
		 * Higher priority = less likely to be evicted when the per-account
		 * quota (default 16 statements) is full. Callers that churn many
		 * statements from the same account (e.g. chat) should set this to a
		 * monotonically increasing value so older submissions are evicted
		 * first instead of being rejected with `StoreFull`.
		 */
		priority?: number;
	},
): Promise<{ hash: string }> {
	const topics = args.topics ?? [];
	if (topics.length > 4) {
		throw new Error(`Statement Store supports at most 4 topics, got ${topics.length}.`);
	}
	const signaturePayload = buildSignaturePayloadWithTopics(topics, args.data, args.priority);
	const signature = await args.sign(signaturePayload);
	const encoded = buildSignedStatement(
		args.data,
		args.publicKey,
		signature,
		topics,
		args.priority,
	);

	if (encoded.length > MAX_STATEMENT_STORE_ENCODED_SIZE) {
		throw new Error(
			`Statement is too large for node propagation (${encoded.length} encoded bytes, max ${MAX_STATEMENT_STORE_ENCODED_SIZE}). Shorten the payload.`,
		);
	}

	const httpUrl = wsToHttp(wsUrl);
	const response = await fetch(httpUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "statement_submit",
			params: [`0x${bytesToHex(encoded)}`],
		}),
	});

	const result = await response.json();
	if (result.error) {
		throw new Error(
			`Statement Store error: ${result.error.message}${result.error.data ? ` (${JSON.stringify(result.error.data)})` : ""}`,
		);
	}
	const hash = "0x" + bytesToHex(blake2b(encoded, undefined, 32));
	return { hash };
}

export interface DecodedStatement {
	hash: string;
	signer: string | null;
	proofType: string | null;
	dataLength: number;
	data: Uint8Array | null;
	topics: string[];
	priority: number | null;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function readCompact(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
	const first = bytes[offset];
	const mode = first & 0b11;
	if (mode === 0) return { value: first >> 2, bytesRead: 1 };
	if (mode === 1) {
		const value = ((bytes[offset + 1] << 8) | first) >> 2;
		return { value, bytesRead: 2 };
	}
	if (mode === 2) {
		const value =
			((bytes[offset + 3] << 24) |
				(bytes[offset + 2] << 16) |
				(bytes[offset + 1] << 8) |
				first) >>>
			2;
		return { value, bytesRead: 4 };
	}
	// Big-integer mode (mode === 3) — not expected for field counts
	throw new Error("Compact big-integer mode not supported");
}

function readVecU8(bytes: Uint8Array, offset: number): { data: Uint8Array; bytesRead: number } {
	const { value: len, bytesRead: prefixLen } = readCompact(bytes, offset);
	const data = bytes.slice(offset + prefixLen, offset + prefixLen + len);
	return { data, bytesRead: prefixLen + len };
}

function readU32LE(bytes: Uint8Array, offset: number): number {
	return (
		bytes[offset] |
		(bytes[offset + 1] << 8) |
		(bytes[offset + 2] << 16) |
		((bytes[offset + 3] << 24) >>> 0)
	);
}

function decodeStatement(encoded: Uint8Array): Omit<DecodedStatement, "hash"> {
	let offset = 0;
	const { value: numFields, bytesRead } = readCompact(encoded, offset);
	offset += bytesRead;

	let signer: string | null = null;
	let proofType: string | null = null;
	let data: Uint8Array | null = null;
	let dataLength = 0;
	const topics: string[] = [];
	let priority: number | null = null;

	for (let i = 0; i < numFields; i++) {
		const tag = encoded[offset];
		offset += 1;

		if (tag === FIELD_AUTHENTICITY_PROOF) {
			const variant = encoded[offset];
			offset += 1;
			if (variant === PROOF_SR25519) {
				proofType = "Sr25519";
				offset += 64; // signature
				signer = "0x" + bytesToHex(encoded.slice(offset, offset + 32));
				offset += 32;
			} else if (variant === PROOF_ED25519) {
				proofType = "Ed25519";
				offset += 64; // signature
				signer = "0x" + bytesToHex(encoded.slice(offset, offset + 32));
				offset += 32;
			} else {
				proofType = variant === 2 ? "Secp256k1Ecdsa" : "OnChain";
				break; // can't safely skip variable-length proof variants
			}
		} else if (tag === FIELD_DECRYPTION_KEY || tag === FIELD_CHANNEL) {
			// Both are fixed [u8; 32]
			offset += 32;
		} else if (tag === FIELD_PRIORITY) {
			priority = readU32LE(encoded, offset);
			offset += 4;
		} else if (
			tag === FIELD_TOPIC1 ||
			tag === FIELD_TOPIC2 ||
			tag === FIELD_TOPIC3 ||
			tag === FIELD_TOPIC4
		) {
			topics.push("0x" + bytesToHex(encoded.slice(offset, offset + 32)));
			offset += 32;
		} else if (tag === FIELD_DATA) {
			const result = readVecU8(encoded, offset);
			data = result.data;
			dataLength = result.data.length;
			offset += result.bytesRead;
		} else {
			break; // unknown field
		}
	}

	return { signer, proofType, data, dataLength, topics, priority };
}

/**
 * Fetch all statements from the node via the statement_dump JSON-RPC method.
 * Returns hex-encoded SCALE statements which are decoded client-side.
 */
export async function fetchStatements(wsUrl: string): Promise<DecodedStatement[]> {
	const httpUrl = wsToHttp(wsUrl);
	const response = await fetch(httpUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "statement_dump",
			params: [],
		}),
	});

	const result = await response.json();
	if (result.error) {
		throw new Error(result.error.message);
	}

	const encoded: string[] = result.result ?? [];
	return encoded.map((hex) => {
		const bytes = hexToBytes(hex);
		const hash = "0x" + bytesToHex(blake2b(bytes, undefined, 32));
		const decoded = decodeStatement(bytes);
		return { hash, ...decoded };
	});
}

/**
 * Fetch full statements (SCALE-encoded) matching all of the given topics
 * via the `statement_broadcastsStatement` JSON-RPC method. The node-side
 * filter requires every topic to match, so the result is naturally scoped
 * to the `[CHAT_NS, ORDER_TOPIC]` pair used by the P2P chat feature.
 */
export async function fetchStatementsByTopics(
	wsUrl: string,
	topics: readonly Uint8Array[],
): Promise<DecodedStatement[]> {
	if (topics.length === 0 || topics.length > 4) {
		throw new Error(`Statement Store requires 1..=4 topics, got ${topics.length}.`);
	}
	const httpUrl = wsToHttp(wsUrl);
	const response = await fetch(httpUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "statement_broadcastsStatement",
			params: [topics.map((t) => `0x${bytesToHex(t)}`)],
		}),
	});

	const result = await response.json();
	if (result.error) {
		throw new Error(result.error.message);
	}

	const encoded: string[] = result.result ?? [];
	return encoded.map((hex) => {
		const bytes = hexToBytes(hex);
		const hash = "0x" + bytesToHex(blake2b(bytes, undefined, 32));
		const decoded = decodeStatement(bytes);
		return { hash, ...decoded };
	});
}
