import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { ss58Address } from "@polkadot-labs/hdkd-helpers";
import type { PolkadotSigner } from "polkadot-api";
import {
	CHAT_NS,
	buildDelegationCanonicalMessage,
	bytesToHex,
	decodeChatEnvelope,
	encodeChatEnvelope,
	hexToBytes,
	orderTopic,
	ss58ToPublicKey,
	verifyDelegationSignature,
	wrapBytesForWalletSig,
	type ChatDelegation,
} from "../utils/chatCodec";
import {
	checkStatementStoreAvailable,
	fetchStatementsByTopics,
	submitSignedStatement,
	type DecodedStatement,
} from "./useStatementStore";

const DEFAULT_POLL_INTERVAL_MS = 2_500;
const DEFAULT_DELEGATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Ephemeral sr25519 keypair that signs every statement in this thread. */
interface EphemeralKey {
	publicKey: Uint8Array;
	sign: (message: Uint8Array) => Uint8Array;
	secretStorageHex: string; // the 32-byte mini-secret we persist
}

function ephemeralStorageKey(wsUrl: string, realAddress: string, orderId: bigint): string {
	return `pba-chat-eph/${wsUrl}/${realAddress}/${orderId.toString()}`;
}

function delegationStorageKey(wsUrl: string, realAddress: string, orderId: bigint): string {
	return `pba-chat-del/${wsUrl}/${realAddress}/${orderId.toString()}`;
}

/** Load or generate a persistent-per-tab ephemeral keypair for this order. */
function loadOrCreateEphemeralKey(
	wsUrl: string,
	realAddress: string,
	orderId: bigint,
): EphemeralKey {
	const storageKey = ephemeralStorageKey(wsUrl, realAddress, orderId);
	let miniSecretHex = localStorage.getItem(storageKey);
	if (!miniSecretHex) {
		const fresh = new Uint8Array(32);
		crypto.getRandomValues(fresh);
		miniSecretHex = bytesToHex(fresh);
		localStorage.setItem(storageKey, miniSecretHex);
	}
	const miniSecret = hexToBytes(miniSecretHex);
	const keypair = sr25519CreateDerive(miniSecret)("");
	return {
		publicKey: keypair.publicKey,
		sign: (msg) => keypair.sign(msg),
		secretStorageHex: miniSecretHex,
	};
}

/** Cached delegation statement the authenticated user submitted last. */
interface StoredDelegation {
	envelope: ChatDelegation;
	expiresAtMs: bigint;
}

function loadCachedDelegation(
	wsUrl: string,
	realAddress: string,
	orderId: bigint,
): StoredDelegation | null {
	const raw = localStorage.getItem(delegationStorageKey(wsUrl, realAddress, orderId));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as {
			realAccount: string;
			ephemeralPub: string;
			expiresAtMs: string;
			walletSignature: string;
		};
		return {
			envelope: {
				kind: "delegation",
				realAccount: hexToBytes(parsed.realAccount),
				ephemeralPub: hexToBytes(parsed.ephemeralPub),
				expiresAtMs: BigInt(parsed.expiresAtMs),
				walletSignature: hexToBytes(parsed.walletSignature),
			},
			expiresAtMs: BigInt(parsed.expiresAtMs),
		};
	} catch {
		return null;
	}
}

function persistDelegation(
	wsUrl: string,
	realAddress: string,
	orderId: bigint,
	delegation: ChatDelegation,
): void {
	localStorage.setItem(
		delegationStorageKey(wsUrl, realAddress, orderId),
		JSON.stringify({
			realAccount: bytesToHex(delegation.realAccount),
			ephemeralPub: bytesToHex(delegation.ephemeralPub),
			expiresAtMs: delegation.expiresAtMs.toString(),
			walletSignature: bytesToHex(delegation.walletSignature),
		}),
	);
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface AuthenticatedMessage {
	hash: string;
	senderRealAccount: string; // ss58
	senderEphemeralPub: string; // hex
	body: string;
	sentAtMs: number;
	fromMe: boolean;
}

export interface UseChatResult {
	/** Node exposes Statement Store RPCs (only true on relay-backed setups). */
	statementStoreAvailable: boolean | null;
	/** True once we have a local ephemeral key + a current valid delegation. */
	ready: boolean;
	/** Messages authenticated against a valid delegation from an allowed party. */
	messages: AuthenticatedMessage[];
	loadError: string | null;
	/** Awaiting the one wallet popup that establishes the session. */
	enabling: boolean;
	enableError: string | null;
	/** One-time (per session) real-wallet signature + delegation broadcast. */
	enableChat: () => Promise<void>;
	sending: boolean;
	sendError: string | null;
	sendMessage: (body: string) => Promise<void>;
}

interface UseChatArgs {
	wsUrl: string;
	orderId: bigint | null;
	/** ss58 address of the wallet-connected real account. */
	myRealAddress: string | null;
	/** Wallet signer (for the one-time delegation step). */
	walletSigner: PolkadotSigner | null | undefined;
	/** ss58 addresses of the allowed participants for this order. */
	allowedParticipants: {
		customer: string | null;
		rider: string | null;
	};
	pollIntervalMs?: number;
	delegationTtlMs?: number;
}

export function useChat({
	wsUrl,
	orderId,
	myRealAddress,
	walletSigner,
	allowedParticipants,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	delegationTtlMs = DEFAULT_DELEGATION_TTL_MS,
}: UseChatArgs): UseChatResult {
	const [statementStoreAvailable, setStatementStoreAvailable] = useState<boolean | null>(null);
	const [rawStatements, setRawStatements] = useState<DecodedStatement[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [enabling, setEnabling] = useState(false);
	const [enableError, setEnableError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);
	const [delegationVersion, setDelegationVersion] = useState(0); // re-trigger `ready`

	const topics = useMemo(() => {
		if (orderId === null) return null;
		return [CHAT_NS, orderTopic(orderId)] as const;
	}, [orderId]);

	// One stable ephemeral key per (wsUrl, account, order) across renders.
	const ephemeralKeyRef = useRef<EphemeralKey | null>(null);
	ephemeralKeyRef.current =
		myRealAddress && orderId !== null
			? ephemeralKeyRef.current &&
				ephemeralKeyRef.current.secretStorageHex ===
					(localStorage.getItem(ephemeralStorageKey(wsUrl, myRealAddress, orderId)) ??
						"") &&
				ephemeralKeyRef.current
				? ephemeralKeyRef.current
				: loadOrCreateEphemeralKey(wsUrl, myRealAddress, orderId)
			: null;

	// Check Statement Store RPC availability once per wsUrl.
	useEffect(() => {
		let cancelled = false;
		setStatementStoreAvailable(null);
		void checkStatementStoreAvailable(wsUrl).then((ok) => {
			if (!cancelled) setStatementStoreAvailable(ok);
		});
		return () => {
			cancelled = true;
		};
	}, [wsUrl]);

	// Poll thread statements. After each poll, if the cached delegation we
	// previously broadcast is no longer in the remote store, we silently
	// re-submit it using the cached wallet signature. This is needed because
	// (a) the dev node's statement store is in-memory and wipes on restart,
	// and (b) once the delegation drops from the store, no message statement
	// — not even our own — passes the authenticator filter below, so the chat
	// would appear empty until the user clicked "Enable chat" again.
	useEffect(() => {
		if (statementStoreAvailable !== true) return;
		if (!topics) return;
		if (!myRealAddress || orderId === null) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let rehydrating = false;

		async function load() {
			try {
				const result = await fetchStatementsByTopics(wsUrl, topics!);
				if (cancelled) return;
				setRawStatements(result);
				setLoadError(null);

				const cached = loadCachedDelegation(wsUrl, myRealAddress!, orderId!);
				if (!cached || !ephemeralKeyRef.current || rehydrating) return;
				if (cached.expiresAtMs <= BigInt(Date.now())) return;
				const myEphHex = bytesToHex(ephemeralKeyRef.current.publicKey).toLowerCase();
				const cachedEphHex = bytesToHex(cached.envelope.ephemeralPub).toLowerCase();
				if (myEphHex !== cachedEphHex) return;
				// Is OUR delegation (not just any statement) represented in the
				// remote store already? We must decode the envelope and look
				// specifically for a `Delegation` variant — chat messages are
				// also signed by our ephemeral key, so checking on signer
				// alone would skip rehydration forever once we've sent one
				// message, leaving the thread unauthenticable for everyone.
				const delegationOnChain = result.some((stmt) => {
					if (!stmt.data || stmt.proofType !== "Sr25519" || !stmt.signer) return false;
					if (stmt.signer.toLowerCase() !== myEphHex) return false;
					const env = decodeChatEnvelope(stmt.data);
					return env?.kind === "delegation";
				});
				if (delegationOnChain) return;

				rehydrating = true;
				try {
					const envelope = encodeChatEnvelope(cached.envelope);
					await submitSignedStatement(wsUrl, {
						data: envelope,
						publicKey: ephemeralKeyRef.current.publicKey,
						sign: ephemeralKeyRef.current.sign,
						topics: topics ? [...topics] : [],
						priority: 0xffff_ffff,
					});
				} catch {
					// swallow — next poll will retry
				} finally {
					rehydrating = false;
				}
			} catch (e) {
				if (!cancelled) {
					setLoadError(e instanceof Error ? e.message : String(e));
				}
			} finally {
				if (!cancelled) {
					timer = setTimeout(load, pollIntervalMs);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [wsUrl, topics, statementStoreAvailable, pollIntervalMs, myRealAddress, orderId]);

	// Index all *valid* delegations we can see in the thread, keyed by
	// ephemeral pubkey. This is what authenticates a chat message sender.
	const verifiedDelegations = useMemo(() => {
		if (orderId === null) return new Map<string, { realSs58: string }>();
		const out = new Map<string, { realSs58: string }>();

		const allowedKeys = new Set<string>();
		if (allowedParticipants.customer)
			allowedKeys.add(bytesToHex(ss58ToPublicKey(allowedParticipants.customer)));
		if (allowedParticipants.rider)
			allowedKeys.add(bytesToHex(ss58ToPublicKey(allowedParticipants.rider)));

		for (const stmt of rawStatements) {
			if (!stmt.data || stmt.proofType !== "Sr25519" || !stmt.signer) continue;
			const env = decodeChatEnvelope(stmt.data);
			if (!env || env.kind !== "delegation") continue;
			// The statement's own signer must match the ephemeral key that the
			// delegation is authorising — otherwise an attacker could reuse
			// someone else's valid delegation under a different ephemeral key.
			const ephemeralInStmt = stmt.signer.toLowerCase();
			const ephemeralInEnv = bytesToHex(env.ephemeralPub).toLowerCase();
			if (ephemeralInStmt !== ephemeralInEnv) continue;

			const realAccountHex = bytesToHex(env.realAccount).toLowerCase();
			if (!allowedKeys.has(realAccountHex)) continue;
			if (!verifyDelegationSignature({ orderId, delegation: env })) continue;

			out.set(ephemeralInEnv, { realSs58: ss58Address(env.realAccount) });
		}
		return out;
	}, [rawStatements, orderId, allowedParticipants.customer, allowedParticipants.rider]);

	const messages = useMemo<AuthenticatedMessage[]>(() => {
		if (orderId === null) return [];
		const myEphemeralHex =
			ephemeralKeyRef.current && bytesToHex(ephemeralKeyRef.current.publicKey).toLowerCase();
		const out: AuthenticatedMessage[] = [];
		for (const stmt of rawStatements) {
			if (!stmt.data || stmt.proofType !== "Sr25519" || !stmt.signer) continue;
			const env = decodeChatEnvelope(stmt.data);
			if (!env || env.kind !== "message") continue;
			const ephemeralHex = stmt.signer.toLowerCase();
			const delegation = verifiedDelegations.get(ephemeralHex);
			if (!delegation) continue;
			let body: string;
			try {
				body = new TextDecoder("utf-8", { fatal: false }).decode(env.body);
			} catch {
				continue;
			}
			out.push({
				hash: stmt.hash,
				senderRealAccount: delegation.realSs58,
				senderEphemeralPub: ephemeralHex,
				body,
				sentAtMs: Number(env.sentAtMs),
				fromMe: ephemeralHex === myEphemeralHex,
			});
		}
		out.sort((a, b) => {
			if (a.sentAtMs !== b.sentAtMs) return a.sentAtMs - b.sentAtMs;
			return a.hash.localeCompare(b.hash);
		});
		return out;
	}, [rawStatements, verifiedDelegations, orderId]);

	const cachedDelegation = useMemo(() => {
		if (!myRealAddress || orderId === null) return null;
		return loadCachedDelegation(wsUrl, myRealAddress, orderId);
		// delegationVersion included so a fresh submit refreshes the memo:
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wsUrl, myRealAddress, orderId, delegationVersion]);

	const ready = useMemo(() => {
		if (!ephemeralKeyRef.current || !cachedDelegation) return false;
		const now = BigInt(Date.now());
		if (cachedDelegation.expiresAtMs <= now) return false;
		// The cached delegation must match our current ephemeral key.
		const myEphHex = bytesToHex(ephemeralKeyRef.current.publicKey).toLowerCase();
		const delEphHex = bytesToHex(cachedDelegation.envelope.ephemeralPub).toLowerCase();
		return myEphHex === delEphHex;
	}, [cachedDelegation, delegationVersion]); // eslint-disable-line react-hooks/exhaustive-deps

	const enableChat = useCallback(async () => {
		setEnableError(null);
		if (orderId === null) {
			setEnableError("Missing order id.");
			return;
		}
		if (!myRealAddress) {
			setEnableError("Connect a wallet first.");
			return;
		}
		if (!walletSigner) {
			setEnableError("Wallet signer not ready.");
			return;
		}
		if (!ephemeralKeyRef.current) {
			setEnableError("Local session key not initialised.");
			return;
		}
		if (statementStoreAvailable !== true) {
			setEnableError("Statement Store RPC is not available on this node.");
			return;
		}

		const ephemeralPub = ephemeralKeyRef.current.publicKey;
		const expiresAtMs = BigInt(Date.now() + delegationTtlMs);
		const canonical = new TextEncoder().encode(
			buildDelegationCanonicalMessage({ orderId, ephemeralPub, expiresAtMs }),
		);

		setEnabling(true);
		try {
			// The wallet internally wraps with <Bytes>…</Bytes>; we sign `canonical`
			// but verification has to reconstruct the wrapping.
			const rawSig = await walletSigner.signBytes(canonical);
			if (rawSig.length !== 64 && rawSig.length !== 65) {
				throw new Error(`Unexpected signature length from wallet: ${rawSig.length}`);
			}
			// Double-check locally — fail fast if the wallet/signer produced
			// something we cannot verify (common cause: extension used ed25519).
			const candidate: ChatDelegation = {
				kind: "delegation",
				realAccount: ss58ToPublicKey(myRealAddress),
				ephemeralPub,
				expiresAtMs,
				walletSignature: rawSig,
			};
			if (!verifyDelegationSignature({ orderId, delegation: candidate })) {
				throw new Error(
					"Wallet signature could not be verified as sr25519. Chat requires an sr25519 account.",
				);
			}

			const envelope = encodeChatEnvelope(candidate);
			await submitSignedStatement(wsUrl, {
				data: envelope,
				publicKey: ephemeralKeyRef.current.publicKey,
				sign: ephemeralKeyRef.current.sign,
				topics: topics ? [...topics] : [],
				// Delegation must never be evicted while the session is live —
				// if it drops, the counterparty can no longer authenticate our
				// messages. u32::MAX keeps it at the top of the per-account
				// eviction queue.
				priority: 0xffff_ffff,
			});
			persistDelegation(wsUrl, myRealAddress, orderId, candidate);
			setDelegationVersion((v) => v + 1);
		} catch (e) {
			setEnableError(e instanceof Error ? e.message : String(e));
		} finally {
			setEnabling(false);
		}
	}, [
		orderId,
		myRealAddress,
		walletSigner,
		statementStoreAvailable,
		delegationTtlMs,
		topics,
		wsUrl,
	]);

	const sendMessage = useCallback(
		async (body: string) => {
			setSendError(null);
			if (orderId === null) {
				setSendError("Missing order id.");
				return;
			}
			if (!ephemeralKeyRef.current || !ready || !topics) {
				setSendError("Chat not enabled yet.");
				return;
			}
			const bodyBytes = new TextEncoder().encode(body);
			if (bodyBytes.length === 0) return;
			setSending(true);
			try {
				const sentAtMs = BigInt(Date.now());
				const envelope = encodeChatEnvelope({
					kind: "message",
					sentAtMs,
					body: bodyBytes,
				});
				// Unix seconds fit in u32 until 2106 and give each message a
				// strictly increasing priority, so when the 16-statement
				// per-account quota fills, the node evicts our oldest message
				// (lowest priority) instead of rejecting this submission.
				const priority = Math.floor(Number(sentAtMs) / 1000);
				await submitSignedStatement(wsUrl, {
					data: envelope,
					publicKey: ephemeralKeyRef.current.publicKey,
					sign: ephemeralKeyRef.current.sign,
					topics: [...topics],
					priority,
				});
			} catch (e) {
				setSendError(e instanceof Error ? e.message : String(e));
			} finally {
				setSending(false);
			}
		},
		[orderId, ready, topics, wsUrl],
	);

	return {
		statementStoreAvailable,
		ready,
		messages,
		loadError,
		enabling,
		enableError,
		enableChat,
		sending,
		sendError,
		sendMessage,
	};
}

// Export wrapped bytes helper for any diagnostics consumers want to build.
export { wrapBytesForWalletSig };
