import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { getClient } from "../hooks/useChain";
import { parseRestaurantValue, type ParsedMenuRow } from "../utils/restaurantCodec";

type RoleTab = "customer" | "restaurant" | "rider";

/** Placeholder until TemplatePallet exposes orders on-chain. */
const MOCK_ORDERS = [
	{ id: "ORD-1001", customer: "5GrwvaEF…", items: "2× Burger, fries", status: "Placed" },
	{ id: "ORD-1002", customer: "5FHneW46…", items: "Salad, soup", status: "Preparing" },
	{ id: "ORD-1003", customer: "5FLSigC9…", items: "Large pizza", status: "Ready" },
] as const;

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

			{activeTab === "customer" && <CustomerRestaurantsBrowse />}

			{activeTab === "restaurant" && (
				<div className="space-y-6">
					<div>
						<GradientSectionTitle>Orders</GradientSectionTitle>
						<p className="text-xs text-text-tertiary mb-2 text-center">
							Mock queue only — pallet does not store orders yet.
						</p>
						<div className="overflow-x-auto rounded-lg border border-white/[0.06]">
							<table className="w-full text-left text-sm border-collapse">
								<thead>
									<tr className="border-b border-white/[0.1] bg-white/[0.02] text-text-tertiary text-xs uppercase tracking-wider">
										<th className="py-2.5 px-3 font-medium">Order ID</th>
										<th className="py-2.5 px-3 font-medium">Customer</th>
										<th className="py-2.5 px-3 font-medium">Items</th>
										<th className="py-2.5 px-3 font-medium">Status</th>
									</tr>
								</thead>
								<tbody>
									{MOCK_ORDERS.map((row) => (
										<tr
											key={row.id}
											className="border-b border-white/[0.06] text-text-primary last:border-0"
										>
											<td className="py-3 px-3 font-mono text-text-secondary">{row.id}</td>
											<td className="py-3 px-3 font-mono text-xs">{row.customer}</td>
											<td className="py-3 px-3">{row.items}</td>
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

function CustomerRestaurantsBrowse() {
	const connected = useChainStore((s) => s.connected);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const templatePallet = useChainStore((s) => s.pallets.templatePallet);

	const [menuModal, setMenuModal] = useState<{
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
					venueName={menuModal.venueName}
					menu={menuModal.menu}
					onClose={() => setMenuModal(null)}
				/>
			) : null}
		</div>
	);
}

function RestaurantMenuModal({
	venueName,
	menu,
	onClose,
}: {
	venueName: string;
	menu: ParsedMenuRow[];
	onClose: () => void;
}) {
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

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
							</tr>
						</thead>
						<tbody>
							{menu.length === 0 ? (
								<tr>
									<td colSpan={2} className="py-4 px-3 text-sm text-text-tertiary text-center">
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
									</tr>
								))
							)}
						</tbody>
					</table>
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
							</tr>
						</thead>
						<tbody>
							{parsed.rows.length === 0 ? (
								<tr>
									<td
										colSpan={2}
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
