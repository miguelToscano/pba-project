import { useCallback, useEffect, useState } from "react";
import { useAccount, usePapiSigner } from "@luno-kit/react";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";
import { useConnection } from "../hooks/useConnection";
import { getClient } from "../hooks/useChain";
import { LOCAL_WS_URL, getNetworkPresetEndpoints, type NetworkPreset } from "../config/network";
import { formatDispatchError } from "../utils/format";

function shortAddress(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function HomePage() {
	const { wsUrl, connected, blockNumber, pallets } = useChainStore();
	const { address: walletAddress } = useAccount();
	const { data: walletSigner, isLoading: signerLoading } = usePapiSigner();
	const { connect } = useConnection();
	const [urlInput, setUrlInput] = useState(wsUrl);
	const [error, setError] = useState<string | null>(null);
	const [chainName, setChainName] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [registerBusy, setRegisterBusy] = useState(false);
	const [customerMsg, setCustomerMsg] = useState<string | null>(null);
	const [isCustomer, setIsCustomer] = useState<boolean | null>(null);

	const refreshCustomerStatus = useCallback(async () => {
		if (!connected || pallets.templatePallet !== true || !walletAddress) {
			setIsCustomer(null);
			return;
		}
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const row = await api.query.TemplatePallet.Customers.getValue(walletAddress);
			setIsCustomer(row !== undefined);
		} catch {
			setIsCustomer(null);
		}
	}, [connected, pallets.templatePallet, wsUrl, walletAddress]);

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

	useEffect(() => {
		void refreshCustomerStatus();
	}, [refreshCustomerStatus, blockNumber]);

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

	async function registerAsCustomer() {
		if (!connected || pallets.templatePallet !== true || !walletSigner || !walletAddress) {
			return;
		}
		setRegisterBusy(true);
		setCustomerMsg(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.TemplatePallet.create_customer();
			const result = await tx.signAndSubmit(walletSigner);
			if (!result.ok) {
				setCustomerMsg(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setCustomerMsg("You are registered as a customer.");
			await refreshCustomerStatus();
		} catch (e) {
			console.error(e);
			setCustomerMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setRegisterBusy(false);
		}
	}

	const canRegister =
		connected &&
		pallets.templatePallet === true &&
		!!walletAddress &&
		!!walletSigner &&
		!signerLoading &&
		!registerBusy &&
		isCustomer !== true;

	return (
		<div className="space-y-8 animate-fade-in">
			{/* Hero */}
			<div className="space-y-3">
				<h1 className="page-title">
					Polkadot Stack{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Template
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-2xl">
					A developer starter template demonstrating Proof of Existence using a Substrate
					FRAME pallet. Drop a file to claim its hash on-chain.
				</p>
			</div>

			{/* Connection card */}
			<div className="card space-y-5">
				<div className="flex flex-wrap gap-2">
					<button onClick={() => applyPreset("local")} className="btn-secondary text-xs">
						Use Local Dev
					</button>
					<button
						onClick={() => applyPreset("testnet")}
						className="btn-secondary text-xs"
					>
						Use Hub TestNet
					</button>
				</div>

				<div>
					<label className="label">Substrate WebSocket Endpoint</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={urlInput}
							onChange={(e) => setUrlInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleConnect()}
							placeholder={LOCAL_WS_URL}
							className="input-field flex-1"
						/>
						<button
							onClick={handleConnect}
							disabled={connecting}
							className="btn-primary"
						>
							{connecting ? "Connecting..." : "Connect"}
						</button>
					</div>
				</div>

				{/* Status grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<StatusItem label="Chain Status">
						{error ? (
							<span className="text-accent-red text-sm">{error}</span>
						) : connected ? (
							<span className="text-accent-green flex items-center gap-1.5">
								<span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-slow" />
								Connected
							</span>
						) : connecting ? (
							<span className="text-accent-yellow">Connecting...</span>
						) : (
							<span className="text-text-muted">Disconnected</span>
						)}
					</StatusItem>
					<StatusItem label="Chain Name">
						{chainName || <span className="text-text-muted">...</span>}
					</StatusItem>
					<StatusItem label="Latest Block">
						<span className="font-mono">#{blockNumber}</span>
					</StatusItem>
				</div>
			</div>

			{/* Feature + customer registration */}
			<div className="max-w-xl space-y-4">
				<FeatureCard
					title="Pallet PoE"
					description="Claim file hashes via the Substrate FRAME pallet using PAPI."
					link="/pallet"
					accentColor="text-accent-blue"
					borderColor="hover:border-accent-blue/20"
					available={pallets.templatePallet}
					unavailableReason="TemplatePallet not found in connected runtime"
				/>

				{pallets.templatePallet === true && (
					<div className="card space-y-4">
						<div>
							<h3 className="text-lg font-semibold font-display text-text-primary mb-1">
								Customer registration
							</h3>
							<p className="text-sm text-text-secondary">
								Submit a{" "}
								<code className="text-xs font-mono bg-white/[0.04] px-1 rounded">
									create_customer
								</code>{" "}
								call using your connected browser extension account. Your wallet will open for
								you to review and sign the extrinsic.
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
						<div className="flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={() => void registerAsCustomer()}
								disabled={!canRegister}
								className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{registerBusy
									? "Awaiting signature / confirming…"
									: "Register as Customer"}
							</button>
							{isCustomer === true && (
								<span className="text-sm text-accent-green font-medium">
									Already registered for this account
								</span>
							)}
							{isCustomer === false && (
								<span className="text-sm text-text-tertiary">Not registered yet</span>
							)}
						</div>
						{customerMsg && (
							<p
								className={`text-sm font-medium ${
									customerMsg.startsWith("Error") ? "text-accent-red" : "text-accent-green"
								}`}
							>
								{customerMsg}
							</p>
						)}
					</div>
				)}
			</div>
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
