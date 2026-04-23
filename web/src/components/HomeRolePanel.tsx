import { Binary } from "polkadot-api";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { useChatDockStore } from "../store/chatDockStore";
import { getClient } from "../hooks/useChain";
import { bytesToHex, ss58ToPublicKey } from "../utils/chatCodec";
import {
	formatMenuPriceUnits,
	parseRestaurantValue,
	type ParsedMenuRow,
} from "../utils/restaurantCodec";
import {
	formatOrderLinesSummary,
	nextAdvanceActionLabel,
	orderLinesWithPricing,
	orderStatusDisplay,
	orderStatusVariant,
	restaurantTerminalActionLabel,
} from "../utils/orderCodec";
import { formatBalance, formatDispatchError, TOKEN_SYMBOL } from "../utils/format";
import { useAccountBalance } from "../hooks/useAccountBalance";
import {
	hashDeliveryPinBlake2_256,
	loadDeliveryPin,
	randomDeliveryPin4,
	rememberDeliveryPin,
} from "../utils/deliveryPin";
import { signAndSubmitAwaitBestBlock } from "../utils/signAndSubmitBestBlock";
import { applyTemplatePalletTxToQueryCache } from "../utils/templatePalletQueryCache";
import FinishDeliveryModal from "./FinishDeliveryModal";
import { parseOrderPlacedFromTxEvents, toOrderId } from "../utils/templatePalletTxEvents";

type RoleTab = "customer" | "restaurant" | "rider";

const TAB_LABEL: Record<RoleTab, string> = {
	customer: "Customer",
	restaurant: "Restaurant",
	rider: "Rider",
};

function shortAddress(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

/**
 * Compare two ss58 addresses by public key, so that different network
 * prefixes (dev=42, polkadot=0, kusama=2, …) don't produce false negatives.
 */
function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	try {
		return bytesToHex(ss58ToPublicKey(a)) === bytesToHex(ss58ToPublicKey(b));
	} catch {
		return false;
	}
}

/** Same gradient treatment as “Eats” in the hero (`Polkadot Eats`). */
function GradientSectionTitle({
	children,
	className = "mb-2 text-center",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<h3 className={`text-lg font-semibold font-display ${className}`}>
			<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
				{children}
			</span>
		</h3>
	);
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

/**
 * Compact pill showing the connected wallet's free native balance. Rendered
 * once at the top of the role-panel card so it is visible for every role tab
 * (Customer / Restaurant / Rider).
 */
function BalanceBadge() {
	const { address } = useAccount();
	const { free, isLoading, isError } = useAccountBalance();

	if (!address) return null;

	let content: ReactNode;
	if (isLoading) {
		content = <span className="text-text-tertiary">Loading balance…</span>;
	} else if (isError || free === null) {
		content = <span className="text-accent-red">Balance unavailable</span>;
	} else {
		content = (
			<>
				<span className="text-text-tertiary">Balance</span>
				<span className="font-mono font-semibold tabular-nums bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
					{formatBalance(free)}
				</span>
				<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent font-medium">
					{TOKEN_SYMBOL}
				</span>
			</>
		);
	}

	return (
		<div
			className="absolute top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs backdrop-blur-sm"
			style={{
				background: "rgba(230,0,122,0.08)",
				border: "1px solid rgba(230,0,122,0.2)",
				boxShadow: "0 0 16px rgba(230,0,122,0.1)",
			}}
			title={address}
		>
			{content}
		</div>
	);
}

function RiderReadyPickupOrders({ isRider }: { isRider: boolean | null }) {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const queryClient = useQueryClient();
	const { data: walletSigner, isLoading: signerLoading } = usePapiSigner();
	const [claimMsg, setClaimMsg] = useState<string | null>(null);
	const openChat = useChatDockStore((s) => s.openChat);

	const query = useQuery({
		queryKey: ["riderReadyPickupOrders", wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const nextRaw = await api.query.TemplatePallet.NextOrderId.getValue({ at: "best" });
			const nextId = toOrderId(nextRaw);
			if (nextId === null || nextId === 0n) return [];

			type Row = {
				id: bigint;
				customer: string;
				restaurant: string;
				assignedRider: string | null;
			};
			const rows: Row[] = [];
			for (let id = 0n; id < nextId; id += 1n) {
				const order = await api.query.TemplatePallet.Orders.getValue(id, { at: "best" });
				if (!order) continue;
				const o = order as {
					customer?: unknown;
					restaurant?: unknown;
					status?: unknown;
					assigned_rider?: unknown;
				};
				if (orderStatusVariant(o.status) !== "ReadyForPickup") continue;
				const customer = typeof o.customer === "string" ? o.customer : null;
				const restaurant = typeof o.restaurant === "string" ? o.restaurant : null;
				if (!customer || !restaurant) continue;
				rows.push({
					id,
					customer,
					restaurant,
					assignedRider: optionalSs58Account(o.assigned_rider),
				});
			}
			rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			return rows;
		},
		enabled: Boolean(connected && templatePallet === true),
		staleTime: 10_000,
	});

	const claimMut = useMutation({
		mutationFn: async (orderId: bigint) => {
			if (!walletSigner) throw new Error("Connect a wallet and approve signing.");
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.claim_order_delivery({ order_id: orderId });
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			return result;
		},
		onMutate: () => {
			setClaimMsg(null);
		},
		onSuccess: (result) => {
			// `applyTemplatePalletTxToQueryCache` handles the `OrderDeliveryClaimed`
			// event: it patches the just-claimed row in all affected order lists
			// (including this one) and pre-seeds `chatOrder`, so we don't need
			// an extra `invalidateQueries` round-trip to storage here.
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: address ?? undefined },
				result,
			);
		},
		onError: (e) => {
			setClaimMsg(e instanceof Error ? e.message : String(e));
		},
	});

	// Rider marking a claimed order as picked up: drives the pallet's
	// `confirm_delivery_pickup`, which moves `ReadyForPickup → OnItsWay`.
	// After the event-driven cache patch runs, the row leaves this list
	// and the restaurant/customer views flip to "On its way" without a
	// storage round-trip. We then open a chat window to the customer and
	// queue an "I'm on my way!" message so the customer is notified without
	// the rider having to type anything.
	const markOnItsWayMut = useMutation({
		mutationFn: async (orderId: bigint) => {
			if (!walletSigner) throw new Error("Connect a wallet and approve signing.");
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.confirm_delivery_pickup({ order_id: orderId });
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			return { result, orderId };
		},
		onMutate: () => {
			setClaimMsg(null);
		},
		onSuccess: ({ result, orderId }) => {
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: address ?? undefined },
				result,
			);
			openChat(orderId, "I'm on my way!");
		},
		onError: (e) => {
			setClaimMsg(e instanceof Error ? e.message : String(e));
		},
	});

	const canAttemptClaim =
		connected &&
		templatePallet === true &&
		!!address &&
		!!walletSigner &&
		!signerLoading &&
		isRider === true;

	return (
		<div className="space-y-3">
			<GradientSectionTitle>Available Orders</GradientSectionTitle>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				On-chain orders in{" "}
				<span className="font-medium text-text-secondary">Ready for pickup</span>{" "}
				(restaurant has marked the order ready; rider assignment is shown when set).
			</p>
			{isRider !== true && (
				<p className="text-xs text-text-secondary text-center">
					Register as a rider (role registration above) to claim orders here.
				</p>
			)}
			{claimMsg && <p className="text-sm text-accent-red text-center">{claimMsg}</p>}
			{query.isPending && (
				<div className="mx-auto w-full rounded-lg border border-white/[0.06] p-6 animate-pulse h-24" />
			)}
			{query.isError && (
				<p className="text-sm text-accent-red text-center">
					{query.error instanceof Error ? query.error.message : "Could not load orders."}
				</p>
			)}
			{query.isSuccess && query.data.length === 0 && (
				<p className="text-sm text-text-secondary text-center">
					No orders are ready for pickup right now.
				</p>
			)}
			{query.isSuccess && query.data.length > 0 && (
				<div className="space-y-2">
					{query.data.map((row) => (
						<div key={row.id.toString()} className="rider-order-item">
							<div className="flex items-start justify-between gap-3">
								<div className="space-y-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="font-mono text-xs font-semibold text-text-secondary">
											Order #{row.id.toString()}
										</span>
										<span
											className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
											style={{
												background: "rgba(6,182,212,0.1)",
												color: "#22D3EE",
												border: "1px solid rgba(6,182,212,0.2)",
											}}
										>
											<span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
											Ready for pickup
										</span>
									</div>
									<div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-text-tertiary">
										<span>
											Customer:{" "}
											<span className="font-mono text-text-secondary">
												{shortAddress(row.customer)}
											</span>
										</span>
										<span>
											Restaurant:{" "}
											<span className="font-mono text-text-secondary">
												{shortAddress(row.restaurant)}
											</span>
										</span>
										{row.assignedRider && (
											<span className="col-span-2">
												Rider:{" "}
												<span className="font-mono text-text-secondary">
													{shortAddress(row.assignedRider)}
												</span>
											</span>
										)}
									</div>
								</div>
								<div className="flex-shrink-0">
									{row.assignedRider ? (
										sameAccount(row.assignedRider, address) ? (
											<button
												type="button"
												disabled={
													markOnItsWayMut.isPending &&
													markOnItsWayMut.variables === row.id
												}
												onClick={() =>
													void markOnItsWayMut.mutateAsync(row.id)
												}
												className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												{markOnItsWayMut.isPending &&
												markOnItsWayMut.variables === row.id
													? "Signing…"
													: "Mark on its way"}
											</button>
										) : (
											<span className="text-xs text-text-muted px-2">
												Claimed
											</span>
										)
									) : (
										<button
											type="button"
											disabled={!canAttemptClaim || claimMut.isPending}
											onClick={() => void claimMut.mutateAsync(row.id)}
											className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
										>
											{claimMut.isPending && claimMut.variables === row.id
												? "Signing…"
												: "Claim delivery"}
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Second rider section: orders in `OnItsWay` assigned to the connected rider.
 * Lives separately from the "Available Orders" list because those only show
 * `ReadyForPickup` — after the rider hits "Mark on its way" the order moves
 * here, which is also the only place the rider sees the Chat affordance
 * (per product: Chat only appears when status is `OnItsWay`).
 */
function RiderMyDeliveriesInProgress() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const openChat = useChatDockStore((s) => s.openChat);
	const queryClient = useQueryClient();
	const { data: walletSigner } = usePapiSigner();

	// Which row (if any) has the Finish-delivery modal open. We track both
	// `orderId` and `customer` so the modal can show who's expecting the
	// delivery without re-reading the orders query.
	const [finishTarget, setFinishTarget] = useState<{
		orderId: bigint;
		customer: string;
	} | null>(null);
	// Last `finish_order_delivery` error to surface inside the modal (e.g.
	// `InvalidDeliveryPin` from the dispatch). Cleared when the modal closes
	// or a new attempt starts.
	const [finishError, setFinishError] = useState<string | null>(null);

	const query = useQuery({
		queryKey: ["riderMyActiveDeliveries", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const nextRaw = await api.query.TemplatePallet.NextOrderId.getValue({ at: "best" });
			const nextId = toOrderId(nextRaw);
			if (nextId === null || nextId === 0n) return [];

			type Row = {
				id: bigint;
				customer: string;
				restaurant: string;
			};
			const rows: Row[] = [];
			for (let id = 0n; id < nextId; id += 1n) {
				const order = await api.query.TemplatePallet.Orders.getValue(id, { at: "best" });
				if (!order) continue;
				const o = order as {
					customer?: unknown;
					restaurant?: unknown;
					status?: unknown;
					assigned_rider?: unknown;
				};
				if (orderStatusVariant(o.status) !== "OnItsWay") continue;
				const rider = optionalSs58Account(o.assigned_rider);
				if (!rider || !sameAccount(rider, address)) continue;
				const customer = typeof o.customer === "string" ? o.customer : null;
				const restaurant = typeof o.restaurant === "string" ? o.restaurant : null;
				if (!customer || !restaurant) continue;
				rows.push({ id, customer, restaurant });
			}
			rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			return rows;
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 10_000,
	});

	// Rider finalises delivery by presenting the plaintext PIN the customer
	// shared at handoff. The pallet hashes it and compares to `hashed_pin`
	// it recorded at `place_order`. On success the held funds are split
	// restaurant/rider and the order enters `Completed`.
	const finishMut = useMutation({
		mutationFn: async ({ orderId, pin }: { orderId: bigint; pin: string }) => {
			if (!walletSigner) throw new Error("Connect a wallet and approve signing.");
			const trimmed = pin.trim();
			if (trimmed.length === 0) throw new Error("Enter the customer's delivery PIN.");
			const pinBytes = new TextEncoder().encode(trimmed);
			if (pinBytes.length > 16) {
				throw new Error("PIN is too long (max 16 bytes).");
			}
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.finish_order_delivery({
				order_id: orderId,
				pin: Binary.fromBytes(pinBytes),
			});
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			return { result, orderId };
		},
		onMutate: () => {
			setFinishError(null);
		},
		onSuccess: ({ result }) => {
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: address ?? undefined },
				result,
			);
			// Dismiss the modal only on success: on failure we keep it open so
			// the rider can correct the PIN and retry without re-opening.
			setFinishTarget(null);
		},
		onError: (e) => {
			setFinishError(e instanceof Error ? e.message : String(e));
		},
	});

	if (!address) return null;
	if (query.isSuccess && query.data.length === 0) return null;

	const canSubmit = Boolean(walletSigner);

	return (
		<div className="space-y-3">
			<GradientSectionTitle>My deliveries in progress</GradientSectionTitle>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				Orders you&apos;ve marked{" "}
				<span className="font-medium text-text-secondary">On its way</span>. Tap{" "}
				<span className="font-medium text-text-secondary">Finish delivery</span> at handoff
				to enter the customer&apos;s PIN and release payment.
			</p>
			{query.isPending && (
				<div className="mx-auto w-full rounded-lg border border-white/[0.06] p-6 animate-pulse h-20" />
			)}
			{query.isError && (
				<p className="text-sm text-accent-red text-center">
					{query.error instanceof Error
						? query.error.message
						: "Could not load your deliveries."}
				</p>
			)}
			{query.isSuccess && query.data.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
					<table className="w-full text-left text-sm border-collapse">
						<thead>
							<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
								<th className="py-2.5 px-3 font-medium">Order</th>
								<th className="py-2.5 px-3 font-medium">Customer</th>
								<th className="py-2.5 px-3 font-medium">Restaurant</th>
								<th className="py-2.5 px-3 font-medium">Status</th>
								<th className="py-2.5 px-3 font-medium">Action</th>
							</tr>
						</thead>
						<tbody>
							{query.data.map((row) => (
								<tr
									key={row.id.toString()}
									className="border-b border-white/[0.06] text-text-primary last:border-0"
								>
									<td className="py-3 px-3 font-mono text-xs text-text-secondary">
										#{row.id.toString()}
									</td>
									<td className="py-3 px-3 font-mono text-xs">
										{shortAddress(row.customer)}
									</td>
									<td className="py-3 px-3 font-mono text-xs">
										{shortAddress(row.restaurant)}
									</td>
									<td className="py-3 px-3">
										<span className="inline-flex shrink-0 items-center rounded-md bg-gradient-to-r from-polka-400 to-polka-600 px-2 py-0.5 text-[0.6875rem] font-semibold leading-none text-white shadow-sm">
											On its way
										</span>
									</td>
									<td className="py-3 px-3 whitespace-nowrap">
										<div className="flex flex-wrap items-center gap-1.5">
											<button
												type="button"
												disabled={!canSubmit}
												onClick={() => {
													setFinishError(null);
													setFinishTarget({
														orderId: row.id,
														customer: row.customer,
													});
												}}
												className="btn-primary text-xs px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												Finish delivery
											</button>
											<button
												type="button"
												onClick={() => openChat(row.id)}
												className="btn-secondary text-xs px-2.5 py-1"
											>
												Chat
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<FinishDeliveryModal
				open={finishTarget !== null}
				orderId={finishTarget?.orderId ?? null}
				customer={finishTarget?.customer ?? null}
				isSubmitting={finishMut.isPending}
				submitError={finishError}
				onClose={() => {
					if (finishMut.isPending) return;
					setFinishTarget(null);
					setFinishError(null);
				}}
				onConfirm={async (pin) => {
					if (!finishTarget) return;
					await finishMut.mutateAsync({ orderId: finishTarget.orderId, pin });
				}}
			/>
		</div>
	);
}

export default function HomeRolePanel({
	isCustomer,
	isRestaurant,
	isRider,
}: {
	isCustomer: boolean | null;
	isRestaurant: boolean | null;
	isRider: boolean | null;
}) {
	const availableTabs = useMemo(() => {
		const t: RoleTab[] = [];
		if (isCustomer === true) t.push("customer");
		if (isRestaurant === true) t.push("restaurant");
		if (isRider === true) t.push("rider");
		return t;
	}, [isCustomer, isRestaurant, isRider]);

	const [activeTab, setActiveTab] = useState<RoleTab>("customer");

	useEffect(() => {
		if (availableTabs.length === 0) return;
		if (!availableTabs.includes(activeTab)) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- keep tab valid when role flags change
			setActiveTab(availableTabs[0]!);
		}
	}, [availableTabs, activeTab]);

	if (availableTabs.length === 0) {
		return null;
	}

	const TAB_DOT_COLOR: Record<RoleTab, string> = {
		customer: "#e6007a",
		restaurant: "#F59E0B",
		rider: "#06B6D4",
	};

	return (
		<div className="card space-y-5 relative">
			<BalanceBadge />

			{/* Role tab switcher */}
			{availableTabs.length > 1 && (
				<div
					className="flex flex-wrap gap-1.5 border-b pb-4 pr-36 sm:pr-44"
					style={{ borderColor: "rgba(255,255,255,0.07)" }}
				>
					{availableTabs.map((tab) => {
						const active = activeTab === tab;
						return (
							<button
								key={tab}
								type="button"
								onClick={() => setActiveTab(tab)}
								className={`role-tab role-tab-${tab}${active ? " role-tab-active" : ""}`}
							>
								<span
									className="role-tab-dot"
									style={
										active
											? {
													background: TAB_DOT_COLOR[tab],
													boxShadow: `0 0 8px ${TAB_DOT_COLOR[tab]}99`,
												}
											: { background: "rgba(255,255,255,0.15)" }
									}
								/>
								{TAB_LABEL[tab]}
							</button>
						);
					})}
				</div>
			)}

			{activeTab === "customer" && <CustomerTabs isCustomer={isCustomer} />}

			{activeTab === "restaurant" && <RestaurantTabs />}

			{activeTab === "rider" && (
				<div className="space-y-6">
					<RiderReadyPickupOrders isRider={isRider} />
					<RiderMyDeliveriesInProgress />
				</div>
			)}
		</div>
	);
}

function OrderStatusBadge({ status }: { status: unknown }) {
	const variant = orderStatusVariant(status);
	const display = orderStatusDisplay(status);

	const styles: Record<string, { bg: string; color: string; border: string }> = {
		Created: {
			bg: "rgba(255,255,255,0.06)",
			color: "#8B8699",
			border: "rgba(139,134,153,0.2)",
		},
		InProgress: {
			bg: "rgba(245,158,11,0.1)",
			color: "#FBBF24",
			border: "rgba(245,158,11,0.25)",
		},
		ReadyForPickup: {
			bg: "rgba(6,182,212,0.1)",
			color: "#22D3EE",
			border: "rgba(6,182,212,0.25)",
		},
		OnItsWay: { bg: "rgba(230,0,122,0.1)", color: "#ff5f7a", border: "rgba(230,0,122,0.25)" },
		Completed: {
			bg: "rgba(16,185,129,0.1)",
			color: "#34D399",
			border: "rgba(16,185,129,0.25)",
		},
	};

	const s = styles[variant] ?? styles.Created!;

	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
			style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
		>
			<span
				className="w-1.5 h-1.5 rounded-full flex-shrink-0"
				style={{ background: s.color }}
			/>
			{display}
		</span>
	);
}

type CustomerSubTab = "orders" | "restaurants";

function CustomerTabs({ isCustomer }: { isCustomer: boolean | null }) {
	const [subTab, setSubTab] = useState<CustomerSubTab>("orders");

	const tabs: Array<{ id: CustomerSubTab; label: string }> = [
		{ id: "orders", label: "My orders" },
		{ id: "restaurants", label: "Available Restaurants" },
	];

	return (
		<div className="space-y-4">
			<div
				role="tablist"
				aria-label="Customer sections"
				className="flex flex-wrap gap-1.5 border-b pb-3"
				style={{ borderColor: "rgba(255,255,255,0.07)" }}
			>
				{tabs.map((tab) => {
					const active = subTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => setSubTab(tab.id)}
							className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 ${
								active
									? "text-text-primary"
									: "text-text-secondary hover:text-text-primary hover:bg-white/[0.05]"
							}`}
							style={
								active
									? {
											background: "rgba(230,0,122,0.12)",
											border: "1px solid rgba(230,0,122,0.25)",
										}
									: {}
							}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{subTab === "orders" ? (
				<CustomerMyOrders />
			) : (
				<CustomerRestaurantsBrowse isCustomer={isCustomer} />
			)}
		</div>
	);
}

function CustomerRestaurantsBrowse({ isCustomer }: { isCustomer: boolean | null }) {
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);

	const [menuModal, setMenuModal] = useState<{
		restaurantAddress: string;
		venueName: string;
		menu: ParsedMenuRow[];
	} | null>(null);

	const query = useQuery({
		queryKey: ["customerRestaurantsList", wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			return api.query.TemplatePallet.Restaurants.getEntries({ at: "best" });
		},
		enabled: Boolean(connected && templatePallet === true),
		staleTime: 15_000,
	});

	const list = useMemo(() => {
		if (!query.data) return [];
		return query.data.map((entry) => {
			const address = String(entry.keyArgs[0]);
			const { venueName, menu } = parseRestaurantValue(entry.value);
			return { address, venueName, menu };
		});
	}, [query.data]);

	return (
		<div className="space-y-3">
			{!connected && (
				<p className="text-sm text-text-secondary">
					Connect a wallet to load restaurants from the chain.
				</p>
			)}

			{connected && templatePallet !== true && (
				<p className="text-sm text-text-secondary">
					Template pallet is not available on this endpoint.
				</p>
			)}

			{query.isPending && connected && templatePallet === true && (
				<div className="space-y-2">
					<div className="h-14 rounded-xl skeleton" />
					<div className="h-14 rounded-xl skeleton" />
				</div>
			)}

			{query.isError && (
				<p className="text-sm text-accent-red">
					{query.error instanceof Error
						? query.error.message
						: "Could not load restaurants."}
				</p>
			)}

			{query.isSuccess && list.length === 0 && (
				<div className="py-10 text-center space-y-1">
					<p className="text-sm text-text-secondary">No restaurants on-chain yet.</p>
				</div>
			)}

			{query.isSuccess && list.length > 0 && (
				<ul className="space-y-2">
					{list.map((row) => {
						const displayName = row.venueName.trim() || "Unnamed restaurant";
						return (
							<li key={row.address}>
								<button
									type="button"
									onClick={() =>
										setMenuModal({
											restaurantAddress: row.address,
											venueName: displayName,
											menu: row.menu,
										})
									}
									className="restaurant-browse-card w-full text-left"
								>
									<div
										className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
										style={{
											background: "rgba(245,158,11,0.1)",
											border: "1px solid rgba(245,158,11,0.2)",
										}}
									>
										🍽
									</div>
									<div className="flex-1 min-w-0">
										<span className="font-semibold text-text-primary block truncate">
											{displayName}
										</span>
										<span className="text-xs text-text-tertiary">
											{row.menu.length} item{row.menu.length !== 1 ? "s" : ""}{" "}
											on menu · tap to order
										</span>
									</div>
									<svg
										viewBox="0 0 16 16"
										className="w-4 h-4 text-text-muted flex-shrink-0"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
									>
										<path
											d="M6 4l4 4-4 4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{menuModal ? (
				<RestaurantMenuModal
					key={menuModal.restaurantAddress}
					restaurantAddress={menuModal.restaurantAddress}
					venueName={menuModal.venueName}
					menu={menuModal.menu}
					isCustomer={isCustomer}
					onClose={() => setMenuModal(null)}
				/>
			) : null}
		</div>
	);
}

function CustomerMyOrders() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const openChat = useChatDockStore((s) => s.openChat);

	const query = useQuery({
		queryKey: ["customerMyOrders", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const ids = await api.query.TemplatePallet.CustomerOrders.getValue(address!, {
				at: "best",
			});
			if (!ids?.length) return [];
			const orders = await Promise.all(
				ids.map((id) => api.query.TemplatePallet.Orders.getValue(id, { at: "best" })),
			);
			const base = ids.map((id, i) => ({ id, order: orders[i] }));
			const restaurantAddrs = new Set<string>();
			for (const row of base) {
				const o = row.order as { restaurant?: unknown } | undefined;
				if (o && typeof o.restaurant === "string") restaurantAddrs.add(o.restaurant);
			}
			const menuEntries = await Promise.all(
				[...restaurantAddrs].map(async (restaurant) => {
					const raw = await api.query.TemplatePallet.Restaurants.getValue(restaurant, {
						at: "best",
					});
					return [restaurant, parseRestaurantValue(raw).menu] as const;
				}),
			);
			const menuByRestaurant = new Map<string, ParsedMenuRow[]>(menuEntries);
			return base.map((row) => {
				const o = row.order as
					| { restaurant?: unknown; assigned_rider?: unknown }
					| undefined;
				const r = o && typeof o.restaurant === "string" ? o.restaurant : null;
				const menu = r ? (menuByRestaurant.get(r) ?? []) : [];
				const assignedRider = o ? optionalSs58Account(o.assigned_rider) : null;
				return { ...row, menu, assignedRider };
			});
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 10_000,
	});

	return (
		<div className="space-y-3">
			{!address && (
				<p className="text-sm text-text-secondary">Connect a wallet to see your orders.</p>
			)}
			{query.isPending && address && (
				<div className="space-y-3">
					<div className="rounded-xl border border-white/[0.06] p-4 h-24 skeleton" />
					<div className="rounded-xl border border-white/[0.06] p-4 h-20 skeleton" />
				</div>
			)}
			{query.isError && (
				<p className="text-sm text-accent-red">
					{query.error instanceof Error ? query.error.message : "Could not load orders."}
				</p>
			)}
			{query.isSuccess && (!query.data || query.data.length === 0) && (
				<div className="py-10 text-center space-y-1">
					<p className="text-sm text-text-secondary">No orders yet.</p>
					<p className="text-xs text-text-muted">
						Head to "Order from" to place your first order.
					</p>
				</div>
			)}
			{query.isSuccess && query.data && query.data.length > 0 && (
				<ul className="space-y-3">
					{query.data.map(({ id, order, menu, assignedRider }) => {
						if (!order) return null;
						const o = order as {
							restaurant?: string;
							lines?: unknown;
							status?: unknown;
							delivery_fee?: unknown;
						};
						const { lines: lineDetails, total: itemsSubtotal } = orderLinesWithPricing(
							o.lines,
							menu,
						);
						// `delivery_fee` is snapshotted into the Order at `place_order`
						// time (u128). Prefer the per-order value so historical orders
						// keep showing the fee they actually paid even if the runtime
						// constant changes later.
						const deliveryFee =
							typeof o.delivery_fee === "bigint"
								? o.delivery_fee
								: typeof o.delivery_fee === "number"
									? BigInt(o.delivery_fee)
									: 0n;
						const grandTotal = itemsSubtotal + deliveryFee;
						const orderIdBig = toOrderId(id);
						// Only show the delivery PIN while it's still actionable for the
						// customer: once the restaurant flags the order "Ready for pickup"
						// (and until the rider clears "On its way" by submitting it), the
						// customer needs the PIN handy to read it out at handoff. Before
						// that it's noise, and after `Completed` it's strictly stale.
						const statusVariant = orderStatusVariant(o.status);
						const pinVisible =
							statusVariant === "ReadyForPickup" || statusVariant === "OnItsWay";
						const savedPin =
							pinVisible && address && orderIdBig !== null
								? loadDeliveryPin(wsUrl, address, orderIdBig)
								: null;

						return (
							<li
								key={String(id)}
								className="rounded-xl border overflow-hidden"
								style={{
									borderColor: "rgba(255,255,255,0.07)",
									background: "rgba(14,14,26,0.6)",
								}}
							>
								{/* Order header */}
								<div
									className="flex items-center justify-between gap-3 px-4 py-3 border-b"
									style={{ borderColor: "rgba(255,255,255,0.06)" }}
								>
									<div className="flex items-center gap-2.5 min-w-0">
										<span className="font-mono text-xs font-semibold text-text-muted">
											#{String(id)}
										</span>
										{o.restaurant && (
											<>
												<span className="text-text-muted text-xs">·</span>
												<span className="text-xs text-text-tertiary font-mono truncate">
													{shortAddress(o.restaurant)}
												</span>
											</>
										)}
									</div>
									<div className="flex items-center gap-2 flex-shrink-0">
										{assignedRider && statusVariant !== "Completed" && (
											<button
												type="button"
												onClick={() => openChat(id)}
												className="btn-secondary text-xs px-2.5 py-1"
											>
												Chat
											</button>
										)}
										<OrderStatusBadge status={o.status} />
									</div>
								</div>

								{/* PIN banner — shown prominently when present */}
								{savedPin && (
									<div
										className="flex items-center gap-3 px-4 py-2.5 border-b"
										style={{
											borderColor: "rgba(255,255,255,0.06)",
											background: "rgba(230,0,122,0.06)",
										}}
									>
										<svg
											viewBox="0 0 16 16"
											fill="none"
											className="w-3.5 h-3.5 flex-shrink-0 text-polka-400"
											stroke="currentColor"
											strokeWidth="1.6"
										>
											<rect x="3" y="7" width="10" height="7" rx="1.5" />
											<path
												d="M5.5 7V5a2.5 2.5 0 015 0v2"
												strokeLinecap="round"
											/>
										</svg>
										<span className="text-xs text-text-secondary">
											Delivery PIN — give to rider at handoff:
										</span>
										<span className="font-mono font-bold text-sm text-text-primary tracking-[0.2em]">
											{savedPin}
										</span>
									</div>
								)}

								{/* Line items */}
								{lineDetails.length > 0 && (
									<div className="px-4 py-3 space-y-1.5">
										{lineDetails.map((line, li) => (
											<div
												key={li}
												className="flex items-center justify-between gap-3 text-sm"
											>
												<div className="flex items-center gap-2 min-w-0">
													<span
														className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
														style={{
															background: "rgba(255,255,255,0.06)",
															color: "#8B8699",
														}}
													>
														{line.quantity}
													</span>
													<span className="text-text-primary truncate">
														{line.name}
													</span>
												</div>
												<span className="font-mono text-xs text-text-secondary whitespace-nowrap">
													{formatMenuPriceUnits(line.lineTotal)}
												</span>
											</div>
										))}
										<div
											className="pt-2 border-t space-y-1"
											style={{ borderColor: "rgba(255,255,255,0.07)" }}
										>
											<div className="flex items-center justify-between gap-3 text-xs">
												<span className="text-text-tertiary">Subtotal</span>
												<span className="font-mono text-text-secondary">
													{formatMenuPriceUnits(itemsSubtotal)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-3 text-xs">
												<span className="text-text-tertiary">
													Delivery fee
												</span>
												<span className="font-mono text-text-secondary">
													{formatMenuPriceUnits(deliveryFee)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-3 text-sm font-semibold">
												<span className="text-text-secondary">Total</span>
												<span className="font-mono text-text-primary">
													{formatMenuPriceUnits(grandTotal)}
												</span>
											</div>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

type RestaurantSubTab = "orders" | "menu";

const RESTAURANT_SUB_TABS: Array<{ id: RestaurantSubTab; label: string }> = [
	{ id: "orders", label: "Orders" },
	{ id: "menu", label: "Menu" },
];

/**
 * Restaurant-role sub-navigation: swaps between the incoming Orders table
 * and the on-chain Menu table. Rendering a single table at a time keeps the
 * card compact and gives both sections equal vertical space, unlike the
 * previous stacked layout where long order lists pushed the menu off-screen.
 */
function RestaurantTabs() {
	const [subTab, setSubTab] = useState<RestaurantSubTab>("orders");

	return (
		<div className="space-y-4">
			<div
				role="tablist"
				aria-label="Restaurant sections"
				className="flex flex-wrap gap-1.5 border-b pb-3"
				style={{ borderColor: "rgba(255,255,255,0.07)" }}
			>
				{RESTAURANT_SUB_TABS.map((tab) => {
					const active = subTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => setSubTab(tab.id)}
							className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 ${
								active
									? "text-text-primary"
									: "text-text-secondary hover:text-text-primary hover:bg-white/[0.05]"
							}`}
							style={
								active
									? {
											background: "rgba(245,158,11,0.12)",
											border: "1px solid rgba(245,158,11,0.25)",
										}
									: {}
							}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{subTab === "orders" ? <RestaurantOrdersPanel /> : <RestaurantOnChainMenu />}
		</div>
	);
}

function RestaurantOrdersPanel() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const queryClient = useQueryClient();
	const { data: walletSigner, isLoading: signerLoading } = usePapiSigner();

	const menuQuery = useQuery({
		queryKey: ["homeRestaurantProfile", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			return api.query.TemplatePallet.Restaurants.getValue(address!, { at: "best" });
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 15_000,
	});

	const menuRows = useMemo(() => {
		const raw = menuQuery.data as unknown;
		if (raw === undefined) return [] as ParsedMenuRow[];
		return parseRestaurantValue(raw).menu;
	}, [menuQuery.data]);

	const ordersQuery = useQuery({
		queryKey: ["restaurantOrders", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const ids = await api.query.TemplatePallet.RestaurantOrders.getValue(address!, {
				at: "best",
			});
			if (!ids?.length) return [];
			const orders = await Promise.all(
				ids.map((id) => api.query.TemplatePallet.Orders.getValue(id, { at: "best" })),
			);
			return ids.map((id, i) => ({ id, order: orders[i] }));
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 8_000,
	});

	const advanceMut = useMutation({
		mutationFn: async (orderId: bigint) => {
			if (!address || !walletSigner) throw new Error("Wallet not ready.");
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.advance_order_status({ order_id: orderId });
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			return result;
		},
		onSuccess: (result) => {
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: address ?? undefined },
				result,
			);
		},
	});

	const canAdvance =
		connected && templatePallet === true && !!address && !!walletSigner && !signerLoading;

	return (
		<div>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				From{" "}
				<code className="font-mono text-text-muted">TemplatePallet::RestaurantOrders</code>{" "}
				and <code className="font-mono text-text-muted">Orders</code>
			</p>

			{menuQuery.isSuccess && menuQuery.data === undefined && (
				<p className="text-sm text-text-secondary text-center mb-2">
					No restaurant record for this account — register as a restaurant to receive
					orders.
				</p>
			)}

			{ordersQuery.isPending && (
				<div className="rounded-lg border border-white/[0.06] p-4 animate-pulse space-y-2">
					<div className="h-4 w-1/3 rounded bg-white/[0.06]" />
					<div className="h-10 w-full rounded bg-white/[0.04]" />
				</div>
			)}

			{ordersQuery.isError && (
				<p className="text-sm text-accent-red">
					{ordersQuery.error instanceof Error
						? ordersQuery.error.message
						: "Could not load orders."}
				</p>
			)}

			{ordersQuery.isSuccess && (!ordersQuery.data || ordersQuery.data.length === 0) && (
				<p className="text-sm text-text-secondary text-center">
					No orders yet for this restaurant.
				</p>
			)}

			{ordersQuery.isSuccess && ordersQuery.data && ordersQuery.data.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
					<table className="w-full text-left text-sm border-collapse">
						<thead>
							<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
								<th className="py-2.5 px-3 font-medium">Order ID</th>
								<th className="py-2.5 px-3 font-medium">Customer</th>
								<th className="py-2.5 px-3 font-medium">Items</th>
								<th className="py-2.5 px-3 font-medium">Status</th>
								<th className="py-2.5 px-3 font-medium">Action</th>
							</tr>
						</thead>
						<tbody>
							{ordersQuery.data.map(({ id, order }) => {
								if (!order) return null;
								const o = order as {
									customer?: string;
									lines?: unknown;
									status?: unknown;
								};
								const nextLabel = nextAdvanceActionLabel(o.status);
								const terminalLabel = restaurantTerminalActionLabel(o.status);
								const busyThis =
									advanceMut.isPending && advanceMut.variables === id;
								return (
									<tr
										key={String(id)}
										className="border-b border-white/[0.06] text-text-primary last:border-0"
									>
										<td className="py-3 px-3 font-mono text-text-secondary">
											#{String(id)}
										</td>
										<td className="py-3 px-3 font-mono text-xs">
											{o.customer ? shortAddress(o.customer) : "—"}
										</td>
										<td className="py-3 px-3">
											{formatOrderLinesSummary(o.lines, menuRows)}
										</td>
										<td className="py-3 px-3">
											<span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-text-secondary">
												{orderStatusDisplay(o.status)}
											</span>
										</td>
										<td className="py-3 px-3">
											{nextLabel ? (
												<button
													type="button"
													disabled={!canAdvance || busyThis}
													onClick={() => advanceMut.mutate(id)}
													className="btn-primary text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
												>
													{busyThis ? "Signing…" : nextLabel}
												</button>
											) : (
												<span className="text-xs text-text-tertiary whitespace-nowrap">
													{terminalLabel ?? "—"}
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{advanceMut.isError && (
				<p className="text-sm text-accent-red mt-2 text-center">
					{advanceMut.error instanceof Error
						? advanceMut.error.message
						: String(advanceMut.error)}
				</p>
			)}
		</div>
	);
}

function RestaurantMenuModal({
	restaurantAddress,
	venueName,
	menu,
	isCustomer,
	onClose,
}: {
	restaurantAddress: string;
	venueName: string;
	menu: ParsedMenuRow[];
	isCustomer: boolean | null;
	onClose: () => void;
}) {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);
	const queryClient = useQueryClient();
	const { data: walletSigner, isLoading: signerLoading } = usePapiSigner();

	const [quantities, setQuantities] = useState<number[]>(() => menu.map(() => 0));
	const [placeMsg, setPlaceMsg] = useState<string | null>(null);
	const [step, setStep] = useState<"menu" | "review">("menu");

	// Read delivery fee from runtime constants (synchronous PAPI call)
	const [deliveryFee, setDeliveryFee] = useState<bigint>(500n);
	useEffect(() => {
		if (!connected) return;
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fee = (api.constants as any).TemplatePallet?.DeliveryFee?.();
			if (typeof fee === "bigint") setDeliveryFee(fee);
			else if (typeof fee === "number") setDeliveryFee(BigInt(fee));
		} catch {
			// keep default 500n matching runtime config
		}
	}, [wsUrl, connected]);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				if (step === "review") setStep("menu");
				else onClose();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, step]);

	const placeMut = useMutation({
		mutationFn: async () => {
			if (!walletSigner) throw new Error("Connect a wallet and approve signing.");
			const lines = menu
				.map((_, i) => ({ menu_index: i, quantity: quantities[i] ?? 0 }))
				.filter((l) => l.quantity > 0);
			if (lines.length === 0) throw new Error("Select at least one item.");
			const pin = randomDeliveryPin4();
			const hashedPin = hashDeliveryPinBlake2_256(pin);
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.place_order({
				restaurant: restaurantAddress,
				lines,
				hashed_pin: Binary.fromBytes(hashedPin),
			});
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) throw new Error(formatDispatchError(result.dispatchError));
			return { result, pin };
		},
		onMutate: () => {
			setPlaceMsg(null);
		},
		onSuccess: ({ result, pin }) => {
			setPlaceMsg("Order placed.");
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: address ?? undefined },
				result,
			);
			const placed = parseOrderPlacedFromTxEvents(result.events);
			if (placed && address) {
				rememberDeliveryPin(wsUrl, address, placed.orderId, pin);
				void queryClient.invalidateQueries({
					queryKey: ["customerMyOrders", address, wsUrl],
				});
			}
		},
		onError: (e) => {
			setPlaceMsg(e instanceof Error ? e.message : String(e));
		},
	});

	const selectedItems = menu
		.map((row, i) => ({ row, qty: quantities[i] ?? 0, i }))
		.filter(({ qty }) => qty > 0);
	const subtotal = selectedItems.reduce((acc, { row, qty }) => acc + row.price * BigInt(qty), 0n);
	const total = subtotal + deliveryFee;

	const hasAnyQty = selectedItems.length > 0;
	const registrationReady =
		connected &&
		templatePallet === true &&
		!!address &&
		!!walletSigner &&
		!signerLoading &&
		isCustomer === true;
	const canPlace = registrationReady && hasAnyQty && !placeMut.isPending;

	function increment(i: number) {
		setQuantities((prev) => {
			const next = [...prev];
			next[i] = Math.min(999, (next[i] ?? 0) + 1);
			return next;
		});
	}
	function decrement(i: number) {
		setQuantities((prev) => {
			const next = [...prev];
			next[i] = Math.max(0, (next[i] ?? 0) - 1);
			return next;
		});
	}
	function remove(i: number) {
		setQuantities((prev) => {
			const next = [...prev];
			next[i] = 0;
			return next;
		});
	}

	return (
		<div
			className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="restaurant-menu-modal-title"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="w-full max-w-lg flex flex-col shadow-xl rounded-2xl border overflow-hidden"
				style={{
					borderColor: "rgba(255,255,255,0.1)",
					background:
						"linear-gradient(145deg, rgba(14,14,26,0.98) 0%, rgba(16,16,28,0.96) 100%)",
					maxHeight: "min(90vh, 660px)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* ── Header ── */}
				<div
					className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0"
					style={{ borderColor: "rgba(255,255,255,0.07)" }}
				>
					{step === "review" && (
						<button
							type="button"
							onClick={() => setStep("menu")}
							className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/[0.07] transition-colors"
							aria-label="Back to menu"
						>
							<svg
								viewBox="0 0 16 16"
								fill="none"
								className="w-4 h-4"
								stroke="currentColor"
								strokeWidth="1.8"
							>
								<path
									d="M10 3L5 8l5 5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					)}
					<div className="flex-1 min-w-0">
						<h2
							id="restaurant-menu-modal-title"
							className="font-bold font-display text-text-primary truncate"
						>
							{step === "menu" ? venueName : "Order summary"}
						</h2>
						{step === "menu" && (
							<p className="text-xs text-text-tertiary mt-0.5">
								Select items to add to your order
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/[0.07] transition-colors"
						aria-label="Close"
					>
						<svg
							viewBox="0 0 16 16"
							fill="none"
							className="w-3.5 h-3.5"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
						</svg>
					</button>
				</div>

				{/* ── Menu step ── */}
				{step === "menu" && (
					<>
						<div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
							{menu.length === 0 && (
								<p className="text-sm text-text-tertiary text-center py-8">
									No menu items on-chain.
								</p>
							)}
							{menu.map((row, i) => {
								const qty = quantities[i] ?? 0;
								return (
									<div
										key={`${i}-${row.name}`}
										className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors"
										style={{
											border: "1px solid",
											borderColor:
												qty > 0
													? "rgba(230,0,122,0.2)"
													: "rgba(255,255,255,0.06)",
											background:
												qty > 0
													? "rgba(230,0,122,0.04)"
													: "rgba(255,255,255,0.02)",
										}}
									>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-sm text-text-primary truncate">
												{row.name || "—"}
											</p>
											{row.description && (
												<p className="text-xs text-text-tertiary truncate">
													{row.description}
												</p>
											)}
											<p className="text-xs font-mono text-text-secondary mt-0.5">
												{formatBalance(row.price)} {TOKEN_SYMBOL}
											</p>
										</div>
										<div className="flex items-center gap-1.5 flex-shrink-0">
											{qty === 0 ? (
												<button
													type="button"
													onClick={() => increment(i)}
													className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-150"
													style={{
														background: "rgba(230,0,122,0.12)",
														color: "#ff5f7a",
														border: "1px solid rgba(230,0,122,0.2)",
													}}
												>
													<svg
														viewBox="0 0 12 12"
														fill="none"
														className="w-3 h-3"
														stroke="currentColor"
														strokeWidth="2"
													>
														<path
															d="M6 2v8M2 6h8"
															strokeLinecap="round"
														/>
													</svg>
													Add
												</button>
											) : (
												<>
													<button
														type="button"
														onClick={() => decrement(i)}
														aria-label="Decrease quantity"
														className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors border border-white/[0.08]"
													>
														<svg
															viewBox="0 0 12 12"
															fill="none"
															className="w-3 h-3"
															stroke="currentColor"
															strokeWidth="2"
														>
															<path
																d="M2 6h8"
																strokeLinecap="round"
															/>
														</svg>
													</button>
													<span className="w-6 text-center text-sm font-semibold font-mono text-text-primary tabular-nums">
														{qty}
													</span>
													<button
														type="button"
														onClick={() => increment(i)}
														aria-label="Increase quantity"
														className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors border border-white/[0.08]"
													>
														<svg
															viewBox="0 0 12 12"
															fill="none"
															className="w-3 h-3"
															stroke="currentColor"
															strokeWidth="2"
														>
															<path
																d="M6 2v8M2 6h8"
																strokeLinecap="round"
															/>
														</svg>
													</button>
													<button
														type="button"
														onClick={() => remove(i)}
														aria-label="Remove item"
														className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-accent-red hover:bg-red-500/10 transition-colors border border-white/[0.06]"
													>
														<svg
															viewBox="0 0 14 14"
															fill="none"
															className="w-3.5 h-3.5"
															stroke="currentColor"
															strokeWidth="1.6"
														>
															<path
																d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M11.5 3.5l-.7 7.5a1 1 0 01-1 .9H4.2a1 1 0 01-1-.9L2.5 3.5"
																strokeLinecap="round"
																strokeLinejoin="round"
															/>
															<path
																d="M5.5 6v3.5M8.5 6v3.5"
																strokeLinecap="round"
															/>
														</svg>
													</button>
												</>
											)}
										</div>
									</div>
								);
							})}
						</div>

						{/* Footer */}
						<div
							className="flex-shrink-0 px-5 py-4 border-t space-y-3"
							style={{ borderColor: "rgba(255,255,255,0.07)" }}
						>
							{isCustomer !== true && (
								<p className="text-xs text-text-tertiary text-center">
									Register as a customer to place an order.
								</p>
							)}
							<div className="flex items-center justify-between gap-4">
								<div className="text-sm text-text-secondary">
									{hasAnyQty ? (
										<>
											<span className="font-semibold text-text-primary">
												{selectedItems.length}
											</span>
											{" item"}
											{selectedItems.length !== 1 ? "s" : ""}
											<span className="text-text-muted mx-1">·</span>
											<span className="font-mono font-semibold text-text-primary">
												{formatBalance(subtotal)}
											</span>
											<span className="text-text-muted ml-1 text-xs">
												{TOKEN_SYMBOL}
											</span>
										</>
									) : (
										<span className="text-text-muted text-xs">
											No items selected
										</span>
									)}
								</div>
								<button
									type="button"
									disabled={!registrationReady || !hasAnyQty}
									onClick={() => setStep("review")}
									className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
								>
									Review order
									<svg
										viewBox="0 0 14 14"
										fill="none"
										className="w-3.5 h-3.5"
										stroke="currentColor"
										strokeWidth="1.8"
									>
										<path
											d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
							</div>
						</div>
					</>
				)}

				{/* ── Review step ── */}
				{step === "review" && (
					<>
						<div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
							{/* Selected items */}
							<div className="space-y-2">
								{selectedItems.map(({ row, qty, i }) => (
									<div
										key={i}
										className="flex items-center justify-between gap-3 text-sm"
									>
										<div className="flex items-center gap-2 min-w-0">
											<span
												className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
												style={{
													background: "rgba(230,0,122,0.12)",
													color: "#ff5f7a",
												}}
											>
												{qty}
											</span>
											<span className="text-text-primary truncate">
												{row.name || "—"}
											</span>
										</div>
										<span className="font-mono text-text-secondary whitespace-nowrap text-xs">
											{formatBalance(row.price * BigInt(qty))} {TOKEN_SYMBOL}
										</span>
									</div>
								))}
							</div>

							{/* Cost breakdown */}
							<div
								className="rounded-xl p-4 space-y-2.5"
								style={{
									background: "rgba(255,255,255,0.03)",
									border: "1px solid rgba(255,255,255,0.07)",
								}}
							>
								<div className="flex justify-between text-sm text-text-secondary">
									<span>Subtotal</span>
									<span className="font-mono">{formatBalance(subtotal)} {TOKEN_SYMBOL}</span>
								</div>
								<div className="flex justify-between text-sm text-text-secondary">
									<span>Delivery fee</span>
									<span className="font-mono">{formatBalance(deliveryFee)} {TOKEN_SYMBOL}</span>
								</div>
								<div
									className="pt-2 border-t flex justify-between font-semibold text-text-primary"
									style={{ borderColor: "rgba(255,255,255,0.08)" }}
								>
									<span>Total</span>
									<span className="font-mono">{formatBalance(total)} {TOKEN_SYMBOL}</span>
								</div>
							</div>

							<p className="text-xs text-text-tertiary">
								A random 4-digit delivery PIN will be generated and its hash stored
								on-chain. Your PIN appears under My orders.
							</p>

							{placeMsg && !placeMsg.startsWith("Order placed") && (
								<p className="text-sm text-accent-red">{placeMsg}</p>
							)}
							{placeMsg?.startsWith("Order placed") && (
								<p className="text-sm text-accent-green font-medium">{placeMsg}</p>
							)}
						</div>

						{/* Footer */}
						<div
							className="flex-shrink-0 px-5 py-4 border-t"
							style={{ borderColor: "rgba(255,255,255,0.07)" }}
						>
							<button
								type="button"
								disabled={!canPlace}
								onClick={() => {
									setPlaceMsg(null);
									placeMut.mutate();
								}}
								className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{placeMut.isPending
									? "Awaiting signature…"
									: "Confirm & place order"}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/** Loads `TemplatePallet::Restaurants` for the connected account and lists menu items. */
function RestaurantOnChainMenu() {
	const { address } = useAccount();
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);

	const query = useQuery({
		queryKey: ["homeRestaurantProfile", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			return api.query.TemplatePallet.Restaurants.getValue(address!, { at: "best" });
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 15_000,
	});

	const parsed = useMemo(() => {
		const raw = query.data as unknown;
		if (raw === undefined) {
			return { venueName: null as string | null, rows: [] as ParsedMenuRow[] };
		}
		const { venueName, menu } = parseRestaurantValue(raw);
		return { venueName: venueName || null, rows: menu };
	}, [query.data]);

	return (
		<div>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				From chain storage{" "}
				<code className="font-mono text-text-muted">TemplatePallet::Restaurants</code>
				{parsed.venueName ? (
					<>
						{" "}
						· venue:{" "}
						<span className="text-text-secondary font-medium">{parsed.venueName}</span>
					</>
				) : null}
			</p>

			{query.isPending && (
				<div className="rounded-lg border border-white/[0.06] p-4 animate-pulse space-y-2">
					<div className="h-4 w-1/3 rounded bg-white/[0.06]" />
					<div className="h-10 w-full rounded bg-white/[0.04]" />
				</div>
			)}

			{query.isError && (
				<p className="text-sm text-accent-red">
					{query.error instanceof Error ? query.error.message : "Could not load menu."}
				</p>
			)}

			{query.isSuccess && query.data === undefined && (
				<p className="text-sm text-text-secondary">
					No restaurant record for this account. Register as a restaurant on Home first.
				</p>
			)}

			{query.isSuccess && query.data !== undefined && (
				<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
					<table className="w-full text-left text-sm border-collapse">
						<thead>
							<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
								<th className="py-2.5 px-3 font-medium">Name</th>
								<th className="py-2.5 px-3 font-medium">Description</th>
								<th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
									Price
								</th>
							</tr>
						</thead>
						<tbody>
							{parsed.rows.length === 0 ? (
								<tr>
									<td
										colSpan={3}
										className="py-4 px-3 text-sm text-text-tertiary text-center"
									>
										No menu items stored on-chain.
									</td>
								</tr>
							) : (
								parsed.rows.map((row, i) => (
									<tr
										key={`${i}-${row.name}`}
										className="border-b border-white/[0.06] text-text-primary last:border-0"
									>
										<td className="py-3 px-3 font-medium align-top">
											{row.name || "—"}
										</td>
										<td className="py-3 px-3 text-text-secondary align-top whitespace-pre-wrap break-words">
											{row.description || "—"}
										</td>
										<td className="py-3 px-3 text-text-secondary align-top text-right font-mono text-xs whitespace-nowrap">
											{formatMenuPriceUnits(row.price)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
