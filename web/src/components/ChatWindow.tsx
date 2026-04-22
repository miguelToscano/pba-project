import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { useChatDockStore } from "../store/chatDockStore";
import { getClient } from "../hooks/useChain";
import { useChat } from "../hooks/useChat";
import { bytesToHex, ss58ToPublicKey } from "../utils/chatCodec";

function shortAddress(addr: string): string {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

/**
 * ss58 strings embed a prefix byte, so the same public key renders
 * differently on dev (42) vs polkadot (0) vs kusama (2). Compare the
 * underlying 32-byte public keys instead.
 */
function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	try {
		return bytesToHex(ss58ToPublicKey(a)) === bytesToHex(ss58ToPublicKey(b));
	} catch {
		return false;
	}
}

function optionalSs58Account(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null) {
		const v = value as { type?: unknown; __kind?: unknown; value?: unknown };
		const kind = v.type ?? v.__kind;
		if (kind === "Some" && typeof v.value === "string") return v.value;
	}
	return null;
}

interface ChatWindowProps {
	orderId: bigint;
	minimized: boolean;
}

/**
 * Messenger-style chat window: a compact, self-contained card that renders
 * a single thread's header + body + composer. Minimized state hides
 * everything except the header so users can stack multiple conversations
 * at the bottom of the page without losing context.
 */
export default function ChatWindow({ orderId, minimized }: ChatWindowProps) {
	const wsUrl = useChainStore((s) => s.wsUrl);
	const connected = useChainStore((s) => s.connected);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const { address: myAddress } = useAccount();
	const { data: walletSigner } = usePapiSigner();

	const closeChat = useChatDockStore((s) => s.closeChat);
	const toggleMinimized = useChatDockStore((s) => s.toggleMinimized);
	const pendingOutgoingMessage = useChatDockStore(
		(s) =>
			s.entries.find((e) => e.orderId.toString() === orderId.toString())
				?.pendingOutgoingMessage ?? null,
	);
	const clearPendingOutgoingMessage = useChatDockStore((s) => s.clearPendingOutgoingMessage);

	const orderQuery = useQuery({
		queryKey: ["chatOrder", wsUrl, orderId.toString()],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const order = await api.query.TemplatePallet.Orders.getValue(orderId);
			if (!order) return null;
			const o = order as {
				customer?: unknown;
				assigned_rider?: unknown;
			};
			const customer = typeof o.customer === "string" ? o.customer : null;
			const rider = optionalSs58Account(o.assigned_rider);
			return { customer, rider };
		},
		enabled: connected && templatePallet === true,
		refetchInterval: 8_000,
	});

	const allowedParticipants = useMemo(
		() => ({
			customer: orderQuery.data?.customer ?? null,
			rider: orderQuery.data?.rider ?? null,
		}),
		[orderQuery.data?.customer, orderQuery.data?.rider],
	);

	const amCustomer = sameAccount(myAddress, allowedParticipants.customer);
	const amRider = sameAccount(myAddress, allowedParticipants.rider);
	const iAmParticipant = amCustomer || amRider;

	const chat = useChat({
		wsUrl,
		orderId,
		myRealAddress: iAmParticipant ? (myAddress ?? null) : null,
		walletSigner: walletSigner ?? null,
		allowedParticipants,
	});

	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!minimized && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [chat.messages.length, minimized]);

	// Auto-send a queued message (used when the rider's "Mark on its way"
	// flow opens the chat with an initial "I'm on my way!" line): if chat is
	// already enabled, send immediately; otherwise kick off the one-time
	// delegation signature and let this effect re-run when `chat.ready` flips.
	// `autoEnableTriedRef` guards against re-invoking `enableChat` across
	// re-renders while the wallet popup is still open.
	const autoEnableTriedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!pendingOutgoingMessage || !iAmParticipant) return;
		if (chat.statementStoreAvailable !== true) return;
		if (chat.sending) return;

		if (chat.ready) {
			void chat.sendMessage(pendingOutgoingMessage).then(() => {
				clearPendingOutgoingMessage(orderId);
			});
			return;
		}

		if (!walletSigner || chat.enabling) return;
		const key = `${wsUrl}:${orderId.toString()}:${pendingOutgoingMessage}`;
		if (autoEnableTriedRef.current === key) return;
		autoEnableTriedRef.current = key;
		void chat.enableChat();
	}, [
		pendingOutgoingMessage,
		iAmParticipant,
		chat,
		clearPendingOutgoingMessage,
		orderId,
		walletSigner,
		wsUrl,
	]);

	const otherPartyAddress = amCustomer ? allowedParticipants.rider : allowedParticipants.customer;
	const otherRoleLabel = amCustomer ? "Rider" : "Customer";

	const headerTitle = iAmParticipant
		? `Order #${orderId.toString()} · ${otherRoleLabel}`
		: `Order #${orderId.toString()}`;
	const headerSubtitle =
		iAmParticipant && otherPartyAddress ? shortAddress(otherPartyAddress) : null;

	const body = (() => {
		if (!connected || templatePallet !== true) {
			return (
				<p className="text-text-muted text-xs px-4 py-3">
					Connect to a chain that exposes the Template Pallet to load the order.
				</p>
			);
		}
		if (orderQuery.isPending) {
			return <div className="animate-pulse h-20 mx-3 my-3 rounded bg-white/[0.04]" />;
		}
		if (orderQuery.isError || orderQuery.data === null) {
			return (
				<p className="text-accent-red text-xs px-4 py-3">
					{orderQuery.error instanceof Error
						? orderQuery.error.message
						: "Order not found on-chain."}
				</p>
			);
		}
		if (!allowedParticipants.rider) {
			return (
				<p className="text-text-muted text-xs px-4 py-3">
					A rider has not claimed this order yet. Chat opens once a rider claims the
					delivery.
				</p>
			);
		}
		if (!iAmParticipant) {
			return (
				<p className="text-text-muted text-xs px-4 py-3">
					Only the order&apos;s customer and assigned rider can open this chat.
				</p>
			);
		}
		if (chat.statementStoreAvailable === false) {
			return (
				<p className="text-text-muted text-xs px-4 py-3">
					This node does not expose Statement Store RPCs, so P2P chat is unavailable.
					Start the full stack with{" "}
					<code className="text-text-secondary font-mono text-[11px]">
						./scripts/start-all.sh
					</code>{" "}
					to enable relay-backed Statement Store.
				</p>
			);
		}

		return (
			<div className="flex flex-col flex-1 min-h-0">
				{!chat.ready && (
					<div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 space-y-2">
						<p className="text-text-secondary text-xs">
							Chat uses an ephemeral in-browser key. Sign one delegation to enable the
							session — messages after that do not prompt the wallet.
						</p>
						{chat.enableError && (
							<p className="text-accent-red text-[11px]">{chat.enableError}</p>
						)}
						<button
							type="button"
							className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
							onClick={() => {
								void chat.enableChat();
							}}
							disabled={chat.enabling || !walletSigner}
						>
							{chat.enabling ? "Awaiting signature…" : "Enable chat"}
						</button>
					</div>
				)}

				<div
					ref={scrollRef}
					className="flex-1 min-h-0 overflow-y-auto space-y-1.5 px-3 py-3"
				>
					{chat.messages.length === 0 && (
						<p className="text-text-muted text-xs text-center py-6">No messages yet.</p>
					)}
					{chat.messages.map((msg) => (
						<div
							key={msg.hash}
							className={`rounded-lg border px-2.5 py-1.5 text-xs ${
								msg.fromMe
									? "border-polka-500/30 bg-polka-500/10 ml-auto max-w-[85%]"
									: "border-white/[0.06] bg-white/[0.02] mr-auto max-w-[85%]"
							}`}
						>
							<p className="text-text-primary whitespace-pre-wrap break-words">
								{msg.body}
							</p>
							<p className="mt-0.5 text-[10px] text-text-tertiary font-mono">
								{msg.fromMe ? "You" : shortAddress(msg.senderRealAccount)} ·{" "}
								{new Date(msg.sentAtMs).toLocaleTimeString()}
							</p>
						</div>
					))}
				</div>

				<form
					className="flex gap-1.5 border-t border-white/[0.06] px-2.5 py-2 bg-surface-950/80"
					onSubmit={(e) => {
						e.preventDefault();
						const trimmed = draft.trim();
						if (!trimmed) return;
						void chat.sendMessage(trimmed).then(() => {
							if (!chat.sendError) setDraft("");
						});
					}}
				>
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						disabled={!chat.ready || chat.sending}
						placeholder={chat.ready ? "Type a message…" : "Enable chat to start"}
						className="flex-1 rounded-md border border-white/[0.12] bg-black/30 px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-polka-500/40"
					/>
					<button
						type="submit"
						className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
						disabled={!chat.ready || chat.sending || !draft.trim()}
					>
						{chat.sending ? "…" : "Send"}
					</button>
				</form>
				{chat.sendError && (
					<p className="text-accent-red text-[11px] px-3 pb-2">{chat.sendError}</p>
				)}
				{chat.loadError && (
					<p className="text-accent-red text-[11px] px-3 pb-2">{chat.loadError}</p>
				)}
			</div>
		);
	})();

	return (
		<div
			className={`pointer-events-auto flex flex-col w-80 rounded-t-xl border border-b-0 border-white/[0.1] bg-surface-900/95 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-200 ${
				minimized ? "h-11" : "h-[26rem]"
			}`}
		>
			<button
				type="button"
				onClick={() => toggleMinimized(orderId)}
				className="flex items-center justify-between gap-2 px-3 py-2 bg-polka-500/15 border-b border-polka-500/20 hover:bg-polka-500/20 transition-colors shrink-0"
				title={minimized ? "Open chat" : "Minimize chat"}
			>
				<div className="flex flex-col min-w-0 items-start">
					<span className="text-xs font-semibold text-text-primary truncate">
						{headerTitle}
					</span>
					{headerSubtitle && (
						<span className="text-[10px] font-mono text-text-tertiary truncate">
							{headerSubtitle}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<span
						className="w-6 h-6 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/[0.08] flex items-center justify-center transition-colors"
						aria-label={minimized ? "Open" : "Minimize"}
					>
						{minimized ? (
							<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
								<path d="M2.5 7.5l3.5-3.5 3.5 3.5H2.5z" />
							</svg>
						) : (
							<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
								<rect x="2" y="7" width="8" height="1.5" rx="0.5" />
							</svg>
						)}
					</span>
					<span
						role="button"
						tabIndex={-1}
						onClick={(e) => {
							e.stopPropagation();
							closeChat(orderId);
						}}
						className="w-6 h-6 rounded-md text-text-secondary hover:text-accent-red hover:bg-white/[0.08] flex items-center justify-center transition-colors"
						aria-label="Close chat"
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
							<path
								d="M3 3l6 6M9 3l-6 6"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
					</span>
				</div>
			</button>

			{!minimized && body}
		</div>
	);
}
