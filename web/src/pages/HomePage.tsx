import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Binary } from "polkadot-api";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { useAccountRoles } from "../hooks/useAccountRoles";
import HomeRolePanel from "../components/HomeRolePanel";
import RegisterRestaurantModal, {
	MAX_MENU_ITEM_DESC_BYTES,
	MAX_MENU_ITEM_NAME_BYTES,
	MAX_RESTAURANT_NAME_BYTES,
	type RestaurantRegistrationPayload,
} from "../components/RegisterRestaurantModal";
import { getClient } from "../hooks/useChain";
import { formatDispatchError } from "../utils/format";
import { signAndSubmitAwaitBestBlock } from "../utils/signAndSubmitBestBlock";
import { applyTemplatePalletTxToQueryCache } from "../utils/templatePalletQueryCache";
import { requireUtf8MaxBytes } from "../utils/utf8Bounds";

export default function HomePage() {
	const { wsUrl, connected, pallets } = useChainStore();
	const { address: walletAddress, signer: walletSigner, signerLoading } = useActiveAccount();
	const [busyCustomer, setBusyCustomer] = useState(false);
	const [busyRestaurant, setBusyRestaurant] = useState(false);
	const [busyRider, setBusyRider] = useState(false);

	const [msgCustomer, setMsgCustomer] = useState<string | null>(null);
	const [msgRestaurant, setMsgRestaurant] = useState<string | null>(null);
	const [msgRider, setMsgRider] = useState<string | null>(null);

	const anyRegisterBusy = busyCustomer || busyRestaurant || busyRider;
	const queryClient = useQueryClient();
	const { isCustomer, isRestaurant, isRider } = useAccountRoles();
	const [restaurantModalOpen, setRestaurantModalOpen] = useState(false);

	const palletReady = connected && pallets.templatePallet === true;
	const registrationReady =
		palletReady && !!walletAddress && !!walletSigner && !signerLoading && !anyRegisterBusy;

	async function registerAsCustomer() {
		if (!registrationReady) return;
		setBusyCustomer(true);
		setMsgCustomer(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.create_customer();
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				setMsgCustomer(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setMsgCustomer("Registered as a customer.");
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: walletAddress ?? undefined },
				result,
			);
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
					requireUtf8MaxBytes(
						m.name,
						MAX_MENU_ITEM_NAME_BYTES,
						`Menu item "${m.name}" name`,
					),
				),
				description: Binary.fromBytes(
					requireUtf8MaxBytes(
						m.description,
						MAX_MENU_ITEM_DESC_BYTES,
						`Menu item "${m.name}" description`,
					),
				),
				price: m.price,
			}));
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const tx = (api.tx.TemplatePallet as any).create_restaurant({
				name: Binary.fromBytes(nameBytes),
				menu,
			});
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) throw new Error(formatDispatchError(result.dispatchError));
			setRestaurantModalOpen(false);
			setMsgRestaurant("Registered as a restaurant.");
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: walletAddress ?? undefined },
				result,
			);
		} catch (e) {
			console.error(e);
			throw e instanceof Error ? e : new Error(String(e));
		} finally {
			setBusyRestaurant(false);
		}
	}

	async function registerAsRider() {
		if (!registrationReady) return;
		setBusyRider(true);
		setMsgRider(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.create_rider();
			const result = await signAndSubmitAwaitBestBlock(tx, walletSigner);
			if (!result.ok) {
				setMsgRider(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setMsgRider("Registered as a rider.");
			applyTemplatePalletTxToQueryCache(
				{ queryClient, wsUrl, walletAddress: walletAddress ?? undefined },
				result,
			);
		} catch (e) {
			console.error(e);
			setMsgRider(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setBusyRider(false);
		}
	}

	const hasAnyRole = isCustomer === true || isRestaurant === true || isRider === true;
	const [showRoleReg, setShowRoleReg] = useState(false);

	return (
		<div className="space-y-10 animate-fade-in">
			<RegisterRestaurantModal
				open={restaurantModalOpen}
				onClose={() => !busyRestaurant && setRestaurantModalOpen(false)}
				isSubmitting={busyRestaurant}
				onConfirm={registerRestaurantFromForm}
			/>

			{/* ── Hero ─────────────────────────────── */}
			<div className="pt-4 text-center space-y-4">
				<div
					className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold font-mono tracking-wider uppercase border"
					style={{
						background: "rgba(230,0,122,0.08)",
						borderColor: "rgba(230,0,122,0.2)",
						color: "#ff5f7a",
					}}
				>
					<span className="w-1.5 h-1.5 rounded-full bg-polka-400 animate-glow-pulse" />
					Decentralized · On-chain · Trustless
				</div>

				<h1 className="page-title">
					<span className="text-text-primary">Polkadot</span>{" "}
					<span
						style={{
							background:
								"linear-gradient(135deg, #ff5f7a 0%, #e6007a 50%, #c30066 100%)",
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							backgroundClip: "text",
						}}
					>
						Eats
					</span>
				</h1>

				<p className="text-text-secondary text-base leading-relaxed max-w-lg mx-auto">
					A fully on-chain food delivery protocol. Orders, payments, and delivery
					confirmations live on Substrate — no intermediaries.
				</p>
			</div>

			{/* ── Role panel (only once registered) ─── */}
			{palletReady && hasAnyRole && (
				<HomeRolePanel
					isCustomer={isCustomer}
					isRestaurant={isRestaurant}
					isRider={isRider}
				/>
			)}

			{/* ── Role registration (dev tool) ─────── */}
			{palletReady && (
				<div className="space-y-3">
					<div className="flex justify-center">
						<button
							type="button"
							onClick={() => setShowRoleReg((v) => !v)}
							className="btn-secondary text-xs px-3 py-1.5"
						>
							{showRoleReg ? "Hide role registration" : "Role registration"}
						</button>
					</div>

					{showRoleReg && (
						<div className="card space-y-4 text-sm">
							<p className="text-xs text-text-tertiary">
								Register as a customer, restaurant, or rider. Each action submits
								the matching extrinsic; your wallet will ask you to sign.
							</p>
							{walletAddress && signerLoading && (
								<p className="text-xs text-accent-orange">
									Preparing extension signer…
								</p>
							)}
							{!walletAddress && (
								<p className="text-xs text-accent-yellow">
									Connect a wallet first.
								</p>
							)}
							<RoleRow
								title="Customer"
								callName="create_customer"
								isRegistered={isCustomer}
								busy={busyCustomer}
								canRegister={registrationReady && isCustomer !== true}
								msg={msgCustomer}
								onRegister={() => void registerAsCustomer()}
							/>
							<RoleRow
								title="Restaurant"
								callName="create_restaurant"
								isRegistered={isRestaurant}
								busy={busyRestaurant}
								canRegister={registrationReady && isRestaurant !== true}
								msg={msgRestaurant}
								onRegister={() => setRestaurantModalOpen(true)}
							/>
							<RoleRow
								title="Rider"
								callName="create_rider"
								isRegistered={isRider}
								busy={busyRider}
								canRegister={registrationReady && isRider !== true}
								msg={msgRider}
								onRegister={() => void registerAsRider()}
							/>
						</div>
					)}
				</div>
			)}

			{/* Not connected / pallet unavailable */}
			{!palletReady && (
				<div className="text-center py-16 space-y-3">
					<div
						className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
						style={{
							background: "rgba(255,255,255,0.04)",
							border: "1px solid rgba(255,255,255,0.08)",
						}}
					>
						<svg
							viewBox="0 0 20 20"
							fill="none"
							className="w-6 h-6 text-text-tertiary"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<path
								d="M3.5 5.5l3-3 10 10-3 3-10-10z"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path d="M11 3l3 3" strokeLinecap="round" />
							<path d="M3 11l3 3" strokeLinecap="round" />
						</svg>
					</div>
					<p className="text-text-secondary text-sm">
						{connected
							? "TemplatePallet not found on this chain."
							: "Connecting to chain…"}
					</p>
					<p className="text-text-muted text-xs">
						{connected
							? "Make sure the node is running the correct runtime."
							: "Check the RPC endpoint in the Accounts page."}
					</p>
				</div>
			)}
		</div>
	);
}

function RoleRow({
	title,
	callName,
	isRegistered,
	busy,
	canRegister,
	msg,
	onRegister,
}: {
	title: string;
	callName: string;
	isRegistered: boolean | null;
	busy: boolean;
	canRegister: boolean;
	msg: string | null;
	onRegister: () => void;
}) {
	return (
		<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-t border-white/[0.06]">
			<div>
				<span className="text-sm font-medium text-text-primary">{title}</span>
				<span className="ml-2 font-mono text-xs text-text-muted">{callName}()</span>
				{isRegistered === true && (
					<span className="ml-2 text-xs text-accent-green">✓ registered</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				{isRegistered !== true && (
					<button
						type="button"
						onClick={onRegister}
						disabled={!canRegister}
						className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{busy ? "Signing…" : `Register as ${title}`}
					</button>
				)}
				{msg && (
					<span
						className={`text-xs ${msg.startsWith("Error") ? "text-accent-red" : "text-accent-green"}`}
					>
						{msg}
					</span>
				)}
			</div>
		</div>
	);
}
