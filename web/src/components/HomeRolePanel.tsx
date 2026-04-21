import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "../hooks/useChain";
import {
	formatMenuPriceUnits,
	parseRestaurantValue,
	type ParsedMenuRow,
} from "../utils/restaurantCodec";
import {
	formatOrderLinesSummary,
	nextAdvanceActionLabel,
	orderStatusDisplay,
} from "../utils/orderCodec";
import { formatDispatchError } from "../utils/format";
import { signAndSubmitAwaitBestBlock } from "../utils/signAndSubmitBestBlock";

type RoleTab = "customer" | "restaurant" | "rider";

/** Placeholder until TemplatePallet exposes deliveries on-chain. */
const MOCK_DELIVERIES = [
	{ id: "DLV-501", orderId: "ORD-1001", dropoff: "North Ave, 12", status: "Assigned" },
	{ id: "DLV-502", orderId: "ORD-1002", dropoff: "Main St, 4B", status: "En route" },
	{ id: "DLV-503", orderId: "ORD-1003", dropoff: "Harbor Rd", status: "Delivered" },
] as const;

const TAB_LABEL: Record<RoleTab, string> = {
	customer: "Customer",
	restaurant: "Restaurant",
	rider: "Rider",
};

function shortAddress(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
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

	return (
		<div className="card space-y-5">
			{availableTabs.length > 1 && (
				<div className="flex flex-wrap gap-1.5 border-b border-white/[0.08] pb-3">
					{availableTabs.map((tab) => (
						<button
							key={tab}
							type="button"
							onClick={() => setActiveTab(tab)}
							className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
								activeTab === tab
									? "bg-polka-500/20 text-text-primary border border-polka-500/30"
									: "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
							}`}
						>
							{TAB_LABEL[tab]}
						</button>
					))}
				</div>
			)}

			{activeTab === "customer" && (
				<div className="space-y-6">
					<CustomerMyOrders />
					<CustomerRestaurantsBrowse isCustomer={isCustomer} />
				</div>
			)}

			{activeTab === "restaurant" && (
				<div className="space-y-6">
					<RestaurantOrdersPanel />
					<RestaurantOnChainMenu />
				</div>
			)}

			{activeTab === "rider" && (
				<div className="space-y-3">
					<GradientSectionTitle>Deliveries</GradientSectionTitle>
					<p className="text-xs text-text-tertiary mb-2 text-center">
						Illustrative rows only — no delivery storage in the pallet yet.
					</p>
					<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
						<table className="w-full text-left text-sm border-collapse">
							<thead>
								<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
									<th className="py-2.5 px-3 font-medium">Delivery ID</th>
									<th className="py-2.5 px-3 font-medium">Order</th>
									<th className="py-2.5 px-3 font-medium">Drop-off</th>
									<th className="py-2.5 px-3 font-medium">Status</th>
								</tr>
							</thead>
							<tbody>
								{MOCK_DELIVERIES.map((row) => (
									<tr
										key={row.id}
										className="border-b border-white/[0.06] text-text-primary last:border-0"
									>
										<td className="py-3 px-3 font-mono text-text-secondary">{row.id}</td>
										<td className="py-3 px-3 font-mono text-xs">{row.orderId}</td>
										<td className="py-3 px-3">{row.dropoff}</td>
										<td className="py-3 px-3">
											<span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-text-secondary">
												{row.status}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
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
			return api.query.TemplatePallet.Restaurants.getEntries();
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
		<div className="space-y-3 text-center">
			<GradientSectionTitle className="mb-0 text-center">Restaurants</GradientSectionTitle>

			{!connected && (
				<p className="text-sm text-text-secondary">Connect a wallet to load restaurants from the chain.</p>
			)}

			{connected && templatePallet !== true && (
				<p className="text-sm text-text-secondary">Template pallet is not available on this endpoint.</p>
			)}

			{query.isPending && connected && templatePallet === true && (
				<div className="mx-auto w-full max-w-md rounded-lg border border-white/[0.06] p-4 animate-pulse space-y-2">
					<div className="h-4 w-2/3 mx-auto rounded bg-white/[0.06]" />
					<div className="h-10 w-full rounded bg-white/[0.04]" />
					<div className="h-10 w-full rounded bg-white/[0.04]" />
				</div>
			)}

			{query.isError && (
				<p className="text-sm text-accent-red">
					{query.error instanceof Error ? query.error.message : "Could not load restaurants."}
				</p>
			)}

			{query.isSuccess && list.length === 0 && (
				<p className="text-sm text-text-secondary">No restaurants registered on-chain yet.</p>
			)}

			{query.isSuccess && list.length > 0 && (
				<ul className="mx-auto w-full max-w-md rounded-lg border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
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
									className="w-full px-3 py-3 flex flex-col gap-0.5 items-center text-center hover:bg-white/[0.04] transition-colors"
								>
									<span className="font-medium text-text-primary">{displayName}</span>
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

	const query = useQuery({
		queryKey: ["customerMyOrders", address, wsUrl],
		queryFn: async () => {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const ids = await api.query.TemplatePallet.CustomerOrders.getValue(address!);
			if (!ids?.length) return [];
			const orders = await Promise.all(
				ids.map((id) => api.query.TemplatePallet.Orders.getValue(id)),
			);
			return ids.map((id, i) => ({ id, order: orders[i] }));
		},
		enabled: Boolean(address && connected && templatePallet === true),
		staleTime: 10_000,
	});

	return (
		<div className="space-y-2 text-center">
			<GradientSectionTitle>My orders</GradientSectionTitle>
			{!address && (
				<p className="text-sm text-text-secondary">Connect a wallet to see your orders.</p>
			)}
			{query.isPending && address && (
				<div className="mx-auto w-full max-w-md rounded-lg border border-white/[0.06] p-4 animate-pulse h-16" />
			)}
			{query.isError && (
				<p className="text-sm text-accent-red">
					{query.error instanceof Error ? query.error.message : "Could not load orders."}
				</p>
			)}
			{query.isSuccess && (!query.data || query.data.length === 0) && (
				<p className="text-sm text-text-secondary">No orders on-chain for this account yet.</p>
			)}
			{query.isSuccess && query.data && query.data.length > 0 && (
				<ul className="mx-auto w-full max-w-md rounded-lg border border-white/[0.06] divide-y divide-white/[0.06] text-left text-sm">
					{query.data.map(({ id, order }) => {
						if (!order) return null;
						const o = order as {
							restaurant?: string;
							lines?: unknown;
							status?: unknown;
						};
						return (
							<li key={String(id)} className="px-3 py-2.5 space-y-0.5">
								<div className="flex justify-between gap-2">
									<span className="font-mono text-xs text-text-secondary">#{String(id)}</span>
									<span className="text-xs text-text-tertiary">{orderStatusDisplay(o.status)}</span>
								</div>
								<p className="text-xs text-text-secondary font-mono break-all">
									{o.restaurant ? shortAddress(o.restaurant) : "—"}
								</p>
							</li>
						);
					})}
				</ul>
			)}
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
			return api.query.TemplatePallet.Restaurants.getValue(address!);
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
			const ids = await api.query.TemplatePallet.RestaurantOrders.getValue(address!);
			if (!ids?.length) return [];
			const orders = await Promise.all(
				ids.map((id) => api.query.TemplatePallet.Orders.getValue(id)),
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
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["restaurantOrders", address, wsUrl] });
		},
	});

	const canAdvance =
		connected && templatePallet === true && !!address && !!walletSigner && !signerLoading;

	return (
		<div>
			<GradientSectionTitle>Orders</GradientSectionTitle>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				From <code className="font-mono text-text-muted">TemplatePallet::RestaurantOrders</code> and{" "}
				<code className="font-mono text-text-muted">Orders</code>
			</p>

			{menuQuery.isSuccess && menuQuery.data === undefined && (
				<p className="text-sm text-text-secondary text-center mb-2">
					No restaurant record for this account — register as a restaurant to receive orders.
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
					{ordersQuery.error instanceof Error ? ordersQuery.error.message : "Could not load orders."}
				</p>
			)}

			{ordersQuery.isSuccess && (!ordersQuery.data || ordersQuery.data.length === 0) && (
				<p className="text-sm text-text-secondary text-center">No orders yet for this restaurant.</p>
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
								const busyThis = advanceMut.isPending && advanceMut.variables === id;
								return (
									<tr
										key={String(id)}
										className="border-b border-white/[0.06] text-text-primary last:border-0"
									>
										<td className="py-3 px-3 font-mono text-text-secondary">#{String(id)}</td>
										<td className="py-3 px-3 font-mono text-xs">
											{o.customer ? shortAddress(o.customer) : "—"}
										</td>
										<td className="py-3 px-3">{formatOrderLinesSummary(o.lines, menuRows)}</td>
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
													className="btn-secondary text-xs whitespace-nowrap disabled:opacity-40"
												>
													{busyThis ? "Signing…" : nextLabel}
												</button>
											) : (
												<span className="text-xs text-text-tertiary">Complete</span>
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
					{advanceMut.error instanceof Error ? advanceMut.error.message : String(advanceMut.error)}
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

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const placeMut = useMutation({
		mutationFn: async () => {
			if (!walletSigner) throw new Error("Connect a wallet and approve signing.");
			const lines = menu
				.map((_, i) => ({
					menu_index: i,
					quantity: quantities[i] ?? 0,
				}))
				.filter((l) => l.quantity > 0);
			if (lines.length === 0) throw new Error("Select at least one item with quantity greater than zero.");
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.place_order({
				restaurant: restaurantAddress,
				lines,
			});
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
		},
		onMutate: () => {
			setPlaceMsg(null);
		},
		onSuccess: () => {
			setPlaceMsg("Order placed.");
			void queryClient.invalidateQueries({ queryKey: ["customerRestaurantsList", wsUrl] });
			void queryClient.invalidateQueries({ queryKey: ["customerMyOrders", address, wsUrl] });
			void queryClient.invalidateQueries({ queryKey: ["restaurantOrders", restaurantAddress, wsUrl] });
			void queryClient.invalidateQueries({ queryKey: ["restaurantOrders"] });
		},
		onError: (e) => {
			setPlaceMsg(e instanceof Error ? e.message : String(e));
		},
	});

	const hasAnyQty = quantities.some((q) => q > 0);
	const registrationReady =
		connected &&
		templatePallet === true &&
		!!address &&
		!!walletSigner &&
		!signerLoading &&
		isCustomer === true;
	const canPlace =
		registrationReady && menu.length > 0 && hasAnyQty && !placeMut.isPending;

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
				className="card w-full max-w-lg max-h-[min(90vh,640px)] overflow-y-auto shadow-xl border border-white/[0.12]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3 mb-4">
					<div className="min-w-0">
						<h2
							id="restaurant-menu-modal-title"
							className="text-lg font-semibold font-display text-text-primary truncate"
						>
							{venueName}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 rounded-lg px-2 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-white/[0.06]"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<GradientSectionTitle>Menu</GradientSectionTitle>
				<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
					<table className="w-full text-left text-sm border-collapse">
						<thead>
							<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
								<th className="py-2.5 px-3 font-medium">Name</th>
								<th className="py-2.5 px-3 font-medium">Description</th>
								<th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Price</th>
								<th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Qty</th>
							</tr>
						</thead>
						<tbody>
							{menu.length === 0 ? (
								<tr>
									<td colSpan={4} className="py-4 px-3 text-sm text-text-tertiary text-center">
										No menu items on-chain.
									</td>
								</tr>
							) : (
								menu.map((row, i) => (
									<tr
										key={`${i}-${row.name}`}
										className="border-b border-white/[0.06] text-text-primary last:border-0"
									>
										<td className="py-3 px-3 font-medium align-top">{row.name || "—"}</td>
										<td className="py-3 px-3 text-text-secondary align-top whitespace-pre-wrap break-words">
											{row.description || "—"}
										</td>
										<td className="py-3 px-3 text-text-secondary align-top text-right font-mono text-xs whitespace-nowrap">
											{formatMenuPriceUnits(row.price)}
										</td>
										<td className="py-3 px-3 align-top text-right">
											<input
												type="number"
												min={0}
												max={999}
												value={quantities[i] ?? 0}
												onChange={(e) => {
													const v = Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0)));
													setQuantities((prev) => {
														const next = [...prev];
														next[i] = v;
														return next;
													});
												}}
												className="w-16 rounded border border-white/[0.12] bg-black/30 px-2 py-1 text-sm text-right font-mono"
											/>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<p className="text-xs text-text-tertiary mt-2">
					Price is stored on-chain as u128 (smallest units; formatting is display-only).
				</p>

				<div className="mt-4 flex flex-col gap-2 border-t border-white/[0.08] pt-4">
					{isCustomer !== true && (
						<p className="text-xs text-text-tertiary text-center">
							Register as a customer (role registration) to place an order.
						</p>
					)}
					<div className="flex flex-wrap items-center justify-center gap-2">
						<button
							type="button"
							disabled={!canPlace}
							onClick={() => {
								setPlaceMsg(null);
								placeMut.mutate();
							}}
							className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{placeMut.isPending ? "Awaiting signature…" : "Place order"}
						</button>
					</div>
					{placeMsg && (
						<p
							className={`text-center text-sm font-medium ${
								placeMsg.startsWith("Order placed") ? "text-accent-green" : "text-accent-red"
							}`}
						>
							{placeMsg}
						</p>
					)}
				</div>
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
			return api.query.TemplatePallet.Restaurants.getValue(address!);
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
			<GradientSectionTitle>Menu</GradientSectionTitle>
			<p className="text-xs text-text-tertiary mb-2 text-center">
				From chain storage <code className="font-mono text-text-muted">TemplatePallet::Restaurants</code>
				{parsed.venueName ? (
					<>
						{" "}
						· venue: <span className="text-text-secondary font-medium">{parsed.venueName}</span>
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
								<th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Price</th>
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
										<td className="py-3 px-3 font-medium align-top">{row.name || "—"}</td>
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
