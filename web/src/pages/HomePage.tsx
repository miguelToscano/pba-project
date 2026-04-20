import { useEffect, useState } from "react";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { Binary } from "polkadot-api";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { useConnection } from "../hooks/useConnection";
import { useAccountRoles } from "../hooks/useAccountRoles";
import HomeRolePanel from "../components/HomeRolePanel";
import RegisterRestaurantModal, {
	MAX_MENU_ITEM_DESC_BYTES,
	MAX_MENU_ITEM_NAME_BYTES,
	MAX_RESTAURANT_NAME_BYTES,
	type RestaurantRegistrationPayload,
} from "../components/RegisterRestaurantModal";
import { getClient } from "../hooks/useChain";
import { LOCAL_WS_URL, getNetworkPresetEndpoints, type NetworkPreset } from "../config/network";
import { formatDispatchError } from "../utils/format";
import { requireUtf8MaxBytes } from "../utils/utf8Bounds";

function shortAddress(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function HomePage() {
	const { wsUrl, connected, pallets } = useChainStore();
	const { address: walletAddress } = useAccount();
	const { data: walletSigner, isLoading: signerLoading } = usePapiSigner();
	const { connect } = useConnection();
	const [urlInput, setUrlInput] = useState(wsUrl);
	const [error, setError] = useState<string | null>(null);
	const [chainName, setChainName] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);

	const [busyCustomer, setBusyCustomer] = useState(false);
	const [busyRestaurant, setBusyRestaurant] = useState(false);
	const [busyRider, setBusyRider] = useState(false);

	const [msgCustomer, setMsgCustomer] = useState<string | null>(null);
	const [msgRestaurant, setMsgRestaurant] = useState<string | null>(null);
	const [msgRider, setMsgRider] = useState<string | null>(null);

	/** Temporary: inspect pallet storage maps (read-only). */
	const [storageListBusy, setStorageListBusy] = useState<
		null | "customers" | "restaurants" | "riders"
	>(null);
	const [storageListText, setStorageListText] = useState<string | null>(null);
	const [storageListError, setStorageListError] = useState<string | null>(null);

	const anyRegisterBusy = busyCustomer || busyRestaurant || busyRider;

	const { isCustomer, isRestaurant, isRider, refetch: refetchRoles } = useAccountRoles();

	const [restaurantModalOpen, setRestaurantModalOpen] = useState(false);
	const [showRoleRegistration, setShowRoleRegistration] = useState(false);

	useEffect(() => {
		setUrlInput(wsUrl);
	}, [wsUrl]);

	useEffect(() => {
		if (!connected) {
			return;
		}

		getClient(wsUrl)
			.getChainSpecData()
			.then((data) => setChainName(data.name))
			.catch(() => {});
	}, [connected, wsUrl]);

	async function handleConnect() {
		setConnecting(true);
		setError(null);
		setChainName(null);
		try {
			const result = await connect(urlInput);
			if (result?.ok && result.chain) {
				setChainName(result.chain.name);
			}
		} catch (e) {
			setError(`Could not connect to ${urlInput}. Is the chain running?`);
			console.error(e);
		} finally {
			setConnecting(false);
		}
	}

	function applyPreset(preset: NetworkPreset) {
		const endpoints = getNetworkPresetEndpoints(preset);
		setUrlInput(endpoints.wsUrl);
	}

	const registrationReady =
		connected &&
		pallets.templatePallet === true &&
		!!walletAddress &&
		!!walletSigner &&
		!signerLoading &&
		!anyRegisterBusy;

	async function registerAsCustomer() {
		if (!registrationReady) return;
		setBusyCustomer(true);
		setMsgCustomer(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.create_customer();
			const result = await tx.signAndSubmit(walletSigner);
			if (!result.ok) {
				setMsgCustomer(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setMsgCustomer("You are registered as a customer.");
			await refetchRoles();
		} catch (e) {
			console.error(e);
			setMsgCustomer(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setBusyCustomer(false);
		}
	}

	async function registerRestaurantFromForm(payload: RestaurantRegistrationPayload) {
		if (!registrationReady || !walletSigner) {
			throw new Error("Connect wallet and RPC, and wait for the signer to be ready.");
		}
		setBusyRestaurant(true);
		setMsgRestaurant(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const nameBytes = requireUtf8MaxBytes(
				payload.restaurantName,
				MAX_RESTAURANT_NAME_BYTES,
				"Restaurant name",
			);
			const menu = payload.menuItems.map((m) => ({
				name: Binary.fromBytes(
					requireUtf8MaxBytes(m.name, MAX_MENU_ITEM_NAME_BYTES, `Menu item “${m.name}” name`),
				),
				description: Binary.fromBytes(
					requireUtf8MaxBytes(
						m.description,
						MAX_MENU_ITEM_DESC_BYTES,
						`Menu item “${m.name}” description`,
					),
				),
			}));
			// Descriptor types refresh with `npx papi update` against a node running this runtime.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const tx = (api.tx.TemplatePallet as any).create_restaurant({
				name: Binary.fromBytes(nameBytes),
				menu,
			});
			const result = await tx.signAndSubmit(walletSigner);
			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			setRestaurantModalOpen(false);
			setMsgRestaurant("You are registered as a restaurant.");
			await refetchRoles();
		} catch (e) {
			console.error(e);
			throw e instanceof Error ? e : new Error(String(e));
		} finally {
			setBusyRestaurant(false);
		}
	}

	async function loadRegisteredAccounts(kind: "customers" | "restaurants" | "riders") {
		if (!connected || pallets.templatePallet !== true) return;
		setStorageListBusy(kind);
		setStorageListError(null);
		setStorageListText(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const entries =
				kind === "customers"
					? await api.query.TemplatePallet.Customers.getEntries()
					: kind === "restaurants"
						? await api.query.TemplatePallet.Restaurants.getEntries()
						: await api.query.TemplatePallet.Riders.getEntries();
			const addresses = entries.map((entry) => String(entry.keyArgs[0]));
			const label =
				kind === "customers"
					? "Customers"
					: kind === "restaurants"
						? "Restaurants"
						: "Riders";
			setStorageListText(
				`${label} (${addresses.length})\n${addresses.length ? addresses.join("\n") : "(none)"}`,
			);
		} catch (e) {
			console.error(e);
			setStorageListError(e instanceof Error ? e.message : String(e));
			setStorageListText(null);
		} finally {
			setStorageListBusy(null);
		}
	}

	async function registerAsRider() {
		if (!registrationReady) return;
		setBusyRider(true);
		setMsgRider(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.create_rider();
			const result = await tx.signAndSubmit(walletSigner);
			if (!result.ok) {
				setMsgRider(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setMsgRider("You are registered as a rider.");
			await refetchRoles();
		} catch (e) {
			console.error(e);
			setMsgRider(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setBusyRider(false);
		}
	}

	function roleStatusLine(reg: boolean | null) {
		if (reg === false) {
			return <span className="text-sm text-text-tertiary">Not registered yet</span>;
		}
		return null;
	}

	function roleMessage(msg: string | null) {
		if (!msg) return null;
		return (
			<p
				className={`text-sm font-medium ${
					msg.startsWith("Error") ? "text-accent-red" : "text-accent-green"
				}`}
			>
				{msg}
			</p>
		);
	}

	return (
		<div className="space-y-8 animate-fade-in">
			<RegisterRestaurantModal
				open={restaurantModalOpen}
				onClose={() => !busyRestaurant && setRestaurantModalOpen(false)}
				isSubmitting={busyRestaurant}
				onConfirm={registerRestaurantFromForm}
			/>

			{/* Hero */}
			<div className="space-y-3 text-center">
				<h1 className="page-title">
					Polkadot{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Eats
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-2xl mx-auto">
					A decentralized way of ordering.
				</p>
			</div>

			{pallets.templatePallet === true && (
				<>
					<HomeRolePanel isCustomer={isCustomer} isRestaurant={isRestaurant} isRider={isRider} />
					<div className="space-y-3">
						<div className="flex justify-center">
							<button
								type="button"
								onClick={() => setShowRoleRegistration((v) => !v)}
								className="btn-secondary text-sm px-4 py-2"
								aria-expanded={showRoleRegistration}
							>
								{showRoleRegistration ? "Hide role registration" : "Show role registration"}
							</button>
						</div>

						{showRoleRegistration && (
							<div className="card space-y-6">
								<div>
									<h3 className="text-lg font-semibold font-display text-text-primary mb-1">
										Role registration
									</h3>
									<p className="text-sm text-text-secondary">
										Register as a customer, restaurant, or rider using your connected browser
										extension. Each action submits the matching extrinsic; your wallet will ask
										you to sign.
									</p>
								</div>
						<div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
							<p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
								Signing account
							</p>
							{walletAddress ? (
								<code
									className="text-sm text-text-primary font-mono break-all"
									title={walletAddress}
								>
									{shortAddress(walletAddress)}
								</code>
							) : (
								<span className="text-sm text-accent-yellow">Connect a wallet (nav bar) first.</span>
							)}
						</div>
						{signerLoading && walletAddress && (
							<p className="text-sm text-accent-yellow">Preparing extension signer…</p>
						)}

						{isCustomer !== true && (
							<RoleRow
								title="Customer"
								callName="create_customer"
								onRegister={() => void registerAsCustomer()}
								disabled={!registrationReady}
								busy={busyCustomer}
								buttonLabel="Register as Customer"
								status={roleStatusLine(isCustomer)}
								message={roleMessage(msgCustomer)}
								withTopDivider={false}
							/>
						)}

						{isRestaurant !== true && (
							<RoleRow
								title="Restaurant"
								callName="create_restaurant"
								onRegister={() => setRestaurantModalOpen(true)}
								disabled={!registrationReady}
								busy={busyRestaurant}
								buttonLabel="Register as Restaurant"
								status={roleStatusLine(isRestaurant)}
								message={roleMessage(msgRestaurant)}
								withTopDivider={isCustomer !== true}
							/>
						)}

						{isRider !== true && (
							<RoleRow
								title="Rider"
								callName="create_rider"
								onRegister={() => void registerAsRider()}
								disabled={!registrationReady}
								busy={busyRider}
								buttonLabel="Register as Rider"
								status={roleStatusLine(isRider)}
								message={roleMessage(msgRider)}
								withTopDivider={isCustomer !== true || isRestaurant !== true}
							/>
						)}

						<div className="border-t border-dashed border-white/[0.12] pt-4 space-y-3">
							<p className="text-xs text-text-tertiary">
								Temporary — list accounts in pallet storage (read-only RPC, no signature).
							</p>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => void loadRegisteredAccounts("customers")}
									disabled={!connected || storageListBusy !== null}
									className="btn-secondary text-xs disabled:opacity-40"
								>
									{storageListBusy === "customers" ? "Loading…" : "List customers"}
								</button>
								<button
									type="button"
									onClick={() => void loadRegisteredAccounts("restaurants")}
									disabled={!connected || storageListBusy !== null}
									className="btn-secondary text-xs disabled:opacity-40"
								>
									{storageListBusy === "restaurants" ? "Loading…" : "List restaurants"}
								</button>
								<button
									type="button"
									onClick={() => void loadRegisteredAccounts("riders")}
									disabled={!connected || storageListBusy !== null}
									className="btn-secondary text-xs disabled:opacity-40"
								>
									{storageListBusy === "riders" ? "Loading…" : "List riders"}
								</button>
							</div>
							{storageListError && (
								<p className="text-sm text-accent-red">{storageListError}</p>
							)}
							{storageListText && (
								<div className="rounded-lg bg-black/25 border border-white/[0.06] px-3 py-2 max-h-48 overflow-y-auto">
									<pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all">
										{storageListText}
									</pre>
								</div>
							)}
						</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function RoleRow({
	title,
	callName,
	onRegister,
	disabled,
	busy,
	buttonLabel,
	status,
	message,
	withTopDivider = true,
}: {
	title: string;
	callName: string;
	onRegister: () => void;
	disabled: boolean;
	busy: boolean;
	buttonLabel: string;
	status: React.ReactNode;
	message: React.ReactNode;
	withTopDivider?: boolean;
}) {
	return (
		<div
			className={`space-y-2 py-3 ${withTopDivider ? "border-t border-white/[0.06]" : ""}`}
		>
			<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
				<div>
					<h4 className="text-sm font-semibold text-text-primary">{title}</h4>
					<p className="text-xs text-text-tertiary mt-0.5">
						<code className="font-mono bg-white/[0.04] px-1 rounded">{callName}</code>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={onRegister}
						disabled={disabled}
						className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed text-sm"
					>
						{busy ? "Awaiting signature / confirming…" : buttonLabel}
					</button>
					{status}
				</div>
			</div>
			{message}
		</div>
	);
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
				{label}
			</h3>
			<p className="text-lg font-semibold text-text-primary">{children}</p>
		</div>
	);
}

function FeatureCard({
	title,
	description,
	link,
	accentColor,
	borderColor,
	available,
	unavailableReason,
}: {
	title: string;
	description: string;
	link: string;
	accentColor: string;
	borderColor: string;
	available: boolean | null;
	unavailableReason: string;
}) {
	if (available !== true) {
		return (
			<div className="card opacity-40">
				<h3 className="text-lg font-semibold mb-2 text-text-muted font-display">{title}</h3>
				<p className="text-sm text-text-muted">{description}</p>
				<p className="text-xs mt-3">
					{available === null ? (
						<span className="text-accent-yellow">Detecting...</span>
					) : (
						<span className="text-accent-red">{unavailableReason}</span>
					)}
				</p>
			</div>
		);
	}

	return (
		<a href={`#${link}`} className={`card-hover block group ${borderColor}`}>
			<h3 className={`text-lg font-semibold mb-2 font-display ${accentColor}`}>{title}</h3>
			<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
				{description}
			</p>
		</a>
	);
}
