import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
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

export default function ChatPage() {
	const params = useParams<{ orderId: string }>();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const connected = useChainStore((s) => s.connected);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const { address: myAddress } = useAccount();
	const { data: walletSigner } = usePapiSigner();

	const orderId = useMemo<bigint | null>(() => {
		if (!params.orderId) return null;
		try {
			return BigInt(params.orderId);
		} catch {
			return null;
		}
	}, [params.orderId]);

	const orderQuery = useQuery({
		queryKey: ["chatOrder", wsUrl, orderId?.toString() ?? null],
		queryFn: async () => {
			if (orderId === null) return null;
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
		enabled: orderId !== null && connected && templatePallet === true,
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
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [chat.messages.length]);

	const otherPartyAddress = amCustomer ? allowedParticipants.rider : allowedParticipants.customer;
	const myRoleLabel = amCustomer ? "Customer" : amRider ? "Rider" : null;
	const otherRoleLabel = amCustomer ? "Rider" : "Customer";

	if (orderId === null) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">Chat</h1>
				<p className="text-accent-red text-sm">Invalid order id in URL.</p>
				<Link to="/" className="btn-secondary text-xs">
					Back to Home
				</Link>
			</div>
		);
	}

	if (!connected || templatePallet !== true) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card">
					<p className="text-text-muted text-sm">
						Connect to a chain that exposes the Template Pallet to load the order.
					</p>
				</div>
			</div>
		);
	}

	if (orderQuery.isPending) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card animate-pulse h-24" />
			</div>
		);
	}

	if (orderQuery.isError || orderQuery.data === null) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card">
					<p className="text-accent-red text-sm">
						{orderQuery.error instanceof Error
							? orderQuery.error.message
							: "Order not found on-chain."}
					</p>
				</div>
			</div>
		);
	}

	if (!allowedParticipants.rider) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card">
					<p className="text-text-muted text-sm">
						A rider has not claimed this order yet. Chat opens once a rider claims the
						delivery.
					</p>
					<Link to="/" className="btn-secondary text-xs mt-3 inline-block">
						Back to Home
					</Link>
				</div>
			</div>
		);
	}

	if (!iAmParticipant) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card">
					<p className="text-text-muted text-sm">
						Only the order's customer and assigned rider can open this chat.
					</p>
				</div>
			</div>
		);
	}

	if (chat.statementStoreAvailable === false) {
		return (
			<div className="space-y-4 animate-fade-in">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<div className="card">
					<p className="text-text-muted text-sm">
						This node does not expose Statement Store RPCs, so P2P chat is unavailable.
						Start the full stack with{" "}
						<code className="text-text-secondary font-mono text-xs">
							./scripts/start-all.sh
						</code>{" "}
						to enable relay-backed Statement Store.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 animate-fade-in">
			<div className="space-y-1">
				<h1 className="page-title text-accent-orange">
					Chat · Order #{orderId.toString()}
				</h1>
				<p className="text-text-tertiary text-xs">
					{myRoleLabel && (
						<>
							You are the <span className="text-text-secondary">{myRoleLabel}</span>
							{" · "}
						</>
					)}
					Chatting with the {otherRoleLabel.toLowerCase()}{" "}
					<span className="font-mono text-text-secondary">
						{otherPartyAddress ? shortAddress(otherPartyAddress) : "—"}
					</span>
				</p>
			</div>

			{!chat.ready && (
				<div className="card space-y-3">
					<p className="text-text-secondary text-sm">
						Chat uses an ephemeral in-browser key so that every message does not require
						a wallet popup. Sign one delegation message now to enable the session.
					</p>
					{chat.enableError && (
						<p className="text-accent-red text-sm">{chat.enableError}</p>
					)}
					<button
						type="button"
						className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
						onClick={() => {
							void chat.enableChat();
						}}
						disabled={chat.enabling || !walletSigner}
					>
						{chat.enabling ? "Awaiting signature…" : "Enable chat"}
					</button>
					{chat.statementStoreAvailable === null && (
						<p className="text-xs text-text-tertiary">
							Checking Statement Store availability…
						</p>
					)}
				</div>
			)}

			<div className="card space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="section-title">
						Messages{" "}
						<span className="text-text-muted text-sm font-normal">
							({chat.messages.length})
						</span>
					</h2>
					{chat.loadError && (
						<span className="text-accent-red text-xs">{chat.loadError}</span>
					)}
				</div>

				<div
					ref={scrollRef}
					className="max-h-[50vh] min-h-[18rem] overflow-y-auto space-y-2 pr-1"
				>
					{chat.messages.length === 0 && (
						<p className="text-text-muted text-sm">No messages yet.</p>
					)}
					{chat.messages.map((msg) => (
						<div
							key={msg.hash}
							className={`rounded-lg border px-3 py-2 text-sm ${
								msg.fromMe
									? "border-polka-500/30 bg-polka-500/10 ml-auto max-w-[80%]"
									: "border-white/[0.06] bg-white/[0.02] mr-auto max-w-[80%]"
							}`}
						>
							<p className="text-text-primary whitespace-pre-wrap break-words">
								{msg.body}
							</p>
							<p className="mt-1 text-xs text-text-tertiary font-mono">
								{msg.fromMe ? "You" : shortAddress(msg.senderRealAccount)} ·{" "}
								{new Date(msg.sentAtMs).toLocaleTimeString()}
							</p>
						</div>
					))}
				</div>

				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const body = draft.trim();
						if (!body) return;
						void chat.sendMessage(body).then(() => {
							if (!chat.sendError) setDraft("");
						});
					}}
				>
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						disabled={!chat.ready || chat.sending}
						placeholder={
							chat.ready ? "Type a message…" : "Enable chat above to start messaging"
						}
						className="flex-1 rounded-md border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-polka-500/40"
					/>
					<button
						type="submit"
						className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
						disabled={!chat.ready || chat.sending || !draft.trim()}
					>
						{chat.sending ? "Sending…" : "Send"}
					</button>
				</form>
				{chat.sendError && <p className="text-accent-red text-xs">{chat.sendError}</p>}
			</div>
		</div>
	);
}
