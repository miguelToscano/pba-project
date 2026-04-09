import { useState, useEffect, useCallback, useRef } from "react";
import { useChainStore } from "../store/chainStore";
import { devAccounts } from "../hooks/useAccount";
import { evmDevAccounts } from "../config/evm";
import { getClient } from "../hooks/useChain";
import { stack_template } from "@polkadot-api/descriptors";
import { formatDispatchError } from "../utils/format";
import {
	getInjectedExtensions,
	connectInjectedExtension,
	type InjectedPolkadotAccount,
} from "polkadot-api/pjs-signer";
import { injectSpektrExtension, SpektrExtensionName } from "@novasamatech/product-sdk";
import { getSs58AddressInfo, Keccak256 } from "@polkadot-api/substrate-bindings";

type HostEnvironment = "desktop-webview" | "web-iframe" | "standalone";

function detectHostEnvironment(): HostEnvironment {
	if (typeof window === "undefined") return "standalone";
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((window as any).__HOST_WEBVIEW_MARK__) return "desktop-webview";
	try {
		if (window !== window.top) return "web-iframe";
	} catch {
		return "web-iframe";
	}
	return "standalone";
}

function isInHost(): boolean {
	return detectHostEnvironment() !== "standalone";
}

function ss58ToH160(ss58Address: string): `0x${string}` {
	const info = getSs58AddressInfo(ss58Address);
	if (!info.isValid) return "0x0000000000000000000000000000000000000000";
	const pub = info.publicKey;
	const isEthDerived = pub.slice(20).every((b) => b === 0xee);
	const ethBytes = isEthDerived ? pub.slice(0, 20) : Keccak256(pub).slice(-20);
	const hex = Array.from(ethBytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `0x${hex}`;
}

interface DisplayAccount {
	name: string;
	ss58: string;
	eth: string;
	type: "dev" | "extension" | "spektr";
}

interface AccountInfo {
	balance: bigint;
	nonce: number;
}

function formatBalance(planck: bigint): string {
	const whole = planck / 1_000_000_000_000n;
	const frac = planck % 1_000_000_000_000n;
	if (frac === 0n) return whole.toLocaleString();
	const fracStr = frac.toString().padStart(12, "0").replace(/0+$/, "");
	return `${whole.toLocaleString()}.${fracStr}`;
}

function CopyableAddress({ label, address }: { label: string; address: string }) {
	const [copied, setCopied] = useState(false);
	function handleCopy() {
		navigator.clipboard.writeText(address);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div
			onClick={handleCopy}
			className="flex items-center gap-2 cursor-pointer group"
			title="Click to copy"
		>
			<span className="text-xs text-gray-500 w-8 shrink-0">{label}</span>
			<code className="text-xs text-gray-300 font-mono break-all flex-1 group-hover:text-white transition-colors">
				{address}
			</code>
			<span className="text-xs text-gray-500 group-hover:text-gray-300 shrink-0 transition-colors">
				{copied ? "Copied!" : "Copy"}
			</span>
		</div>
	);
}

export default function AccountsPage() {
	const { wsUrl, connected } = useChainStore();
	const spektrUnsubscribeRef = useRef<(() => void) | null>(null);
	const extensionUnsubscribeRef = useRef<(() => void) | null>(null);
	const [availableWallets, setAvailableWallets] = useState<string[]>([]);
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
	const [spektrAccounts, setSpektrAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [spektrStatus, setSpektrStatus] = useState<
		"detecting" | "injecting" | "connected" | "unavailable" | "failed"
	>("detecting");
	const [fundStatus, setFundStatus] = useState<string | null>(null);
	const [fundAmount, setFundAmount] = useState("10000");
	const [accountInfos, setAccountInfos] = useState<Record<string, AccountInfo>>({});

	// Build dev account display list
	const devDisplayAccounts: DisplayAccount[] = devAccounts.map((acc, i) => ({
		name: acc.name,
		ss58: acc.address,
		eth: evmDevAccounts[i]?.account.address ?? ss58ToH160(acc.address),
		type: "dev",
	}));

	// All SS58 addresses to query
	const allAddresses = [
		...devAccounts.map((a) => a.address),
		...extensionAccounts.map((a) => a.address),
		...spektrAccounts.map((a) => a.address),
	];

	// Query balances and nonces
	const fetchAccountInfos = useCallback(async () => {
		if (!connected || allAddresses.length === 0) return;
		try {
			const client = getClient(wsUrl);
			const api = client.getTypedApi(stack_template);
			const infos: Record<string, AccountInfo> = {};
			for (const addr of allAddresses) {
				try {
					const info = await api.query.System.Account.getValue(addr);
					infos[addr] = {
						balance: info.data.free,
						nonce: info.nonce,
					};
				} catch {
					// Skip accounts that fail
				}
			}
			setAccountInfos(infos);
		} catch (e) {
			console.error("Failed to fetch account infos:", e);
		}
	}, [connected, wsUrl, allAddresses.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		fetchAccountInfos();
	}, [fetchAccountInfos]);

	// Detect host environment and inject Spektr on mount
	useEffect(() => {
		let cancelled = false;

		async function initSpektr() {
			if (!isInHost()) {
				setSpektrStatus("unavailable");
				return;
			}
			setSpektrStatus("injecting");
			try {
				let injected = false;
				for (let i = 0; i < 10; i++) {
					if (await injectSpektrExtension()) {
						injected = true;
						break;
					}
					if (i < 9) await new Promise((r) => setTimeout(r, 500));
				}
				if (!injected) {
					setSpektrStatus("failed");
					return;
				}
				const ext = await connectInjectedExtension(SpektrExtensionName);
				if (cancelled) {
					ext.disconnect();
					return;
				}
				const accounts = ext.getAccounts();
				setSpektrAccounts(accounts);
				setSpektrStatus("connected");
				spektrUnsubscribeRef.current?.();
				spektrUnsubscribeRef.current = ext.subscribe((updated) => {
					setSpektrAccounts(updated);
				});
			} catch (e) {
				console.error("[Spektr] Init failed:", e);
				setSpektrStatus("failed");
			}
		}

		initSpektr();

		return () => {
			cancelled = true;
			spektrUnsubscribeRef.current?.();
			spektrUnsubscribeRef.current = null;
		};
	}, []);

	// Detect available browser extension wallets on mount
	useEffect(() => {
		try {
			const wallets = getInjectedExtensions().filter((name) => name !== SpektrExtensionName);
			setAvailableWallets(wallets);
		} catch {
			// No injected extensions available
		}
	}, []);

	async function connectWallet(name: string) {
		try {
			const ext = await connectInjectedExtension(name);
			const accounts = ext.getAccounts();
			setExtensionAccounts(accounts);
			setConnectedWallet(name);
			extensionUnsubscribeRef.current?.();
			extensionUnsubscribeRef.current = ext.subscribe((updated) => {
				setExtensionAccounts(updated);
			});
		} catch (e) {
			console.error("Failed to connect wallet:", e);
			setFundStatus(`Error connecting wallet: ${e instanceof Error ? e.message : e}`);
		}
	}

	function disconnectWallet() {
		extensionUnsubscribeRef.current?.();
		extensionUnsubscribeRef.current = null;
		setExtensionAccounts([]);
		setConnectedWallet(null);
	}

	useEffect(() => {
		return () => {
			spektrUnsubscribeRef.current?.();
			extensionUnsubscribeRef.current?.();
		};
	}, []);

	async function fundAccount(ss58Address: string, accountName: string) {
		if (!connected) {
			setFundStatus("Error: Not connected to chain");
			return;
		}
		try {
			const amount = BigInt(fundAmount) * 1_000_000_000_000n;
			setFundStatus(`Funding ${accountName}...`);
			const client = getClient(wsUrl);
			const api = client.getTypedApi(stack_template);
			const aliceSigner = devAccounts[0].signer;
			const tx = api.tx.Sudo.sudo({
				call: api.tx.Balances.force_set_balance({
					who: { type: "Id", value: ss58Address },
					new_free: amount,
				}).decodedCall,
			});
			const result = await tx.signAndSubmit(aliceSigner);
			if (!result.ok) {
				setFundStatus(`Error: ${formatDispatchError(result.dispatchError)}`);
				return;
			}
			setFundStatus(`Funded ${accountName} with ${fundAmount} tokens!`);
			fetchAccountInfos();
		} catch (e) {
			console.error("Fund failed:", e);
			setFundStatus(`Error: ${e instanceof Error ? e.message : e}`);
		}
	}

	const walletNames: Record<string, string> = {
		"polkadot-js": "Polkadot.js",
		"subwallet-js": "SubWallet",
		talisman: "Talisman",
	};

	const typeBadge: Record<string, { bg: string; text: string; label: string }> = {
		dev: { bg: "bg-blue-900", text: "text-blue-300", label: "Dev" },
		extension: {
			bg: "bg-purple-900",
			text: "text-purple-300",
			label: "Extension",
		},
		spektr: { bg: "bg-pink-900", text: "text-pink-300", label: "Spektr" },
	};

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-pink-400">Accounts</h1>
			<p className="text-gray-400">
				Manage dev accounts, connect browser extension wallets, or use Spektr accounts from
				the Polkadot host. Fund accounts using Sudo on the dev chain.
			</p>

			{/* Fund amount */}
			<div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-3">
				<h2 className="text-lg font-semibold text-gray-300">Funding</h2>
				<div className="flex gap-3 items-center">
					<label className="text-sm text-gray-400">Amount (tokens):</label>
					<input
						type="number"
						value={fundAmount}
						onChange={(e) => setFundAmount(e.target.value)}
						className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white w-40 text-sm"
					/>
					<button
						onClick={fetchAccountInfos}
						className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs"
					>
						Refresh Balances
					</button>
				</div>
				{fundStatus && (
					<p
						className={`text-sm ${fundStatus.startsWith("Error") ? "text-red-400" : "text-green-400"}`}
					>
						{fundStatus}
					</p>
				)}
			</div>

			{/* Dev Accounts */}
			<div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
				<h2 className="text-lg font-semibold text-gray-300">Dev Accounts</h2>
				<p className="text-sm text-gray-500">
					Pre-funded accounts from the well-known dev seed phrase.
				</p>
				<div className="space-y-3">
					{devDisplayAccounts.map((acc) => (
						<AccountCard
							key={acc.ss58}
							account={acc}
							info={accountInfos[acc.ss58]}
							badge={typeBadge[acc.type]}
							onFund={() => fundAccount(acc.ss58, acc.name)}
							connected={connected}
						/>
					))}
				</div>
			</div>

			{/* Spektr Accounts (Polkadot Host) */}
			<div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
				<h2 className="text-lg font-semibold text-gray-300">Spektr (Polkadot Host)</h2>
				{spektrStatus === "detecting" && (
					<p className="text-sm text-yellow-400">
						Detecting Polkadot host environment...
					</p>
				)}
				{spektrStatus === "injecting" && (
					<p className="text-sm text-yellow-400">Injecting Spektr extension...</p>
				)}
				{spektrStatus === "unavailable" && (
					<p className="text-sm text-gray-500">
						Not running inside a Polkadot host (Desktop or Web). Spektr accounts are
						only available when loaded through the{" "}
						<a
							href="https://polkadot.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-pink-400 underline"
						>
							Polkadot app
						</a>
						.
					</p>
				)}
				{spektrStatus === "failed" && (
					<p className="text-sm text-red-400">
						Failed to connect to Spektr. The host may not have injected the extension.
					</p>
				)}
				{spektrStatus === "connected" && (
					<div className="space-y-3">
						<p className="text-sm text-green-400">
							Connected to Spektr ({spektrAccounts.length} account
							{spektrAccounts.length !== 1 ? "s" : ""})
						</p>
						{spektrAccounts.map((acc) => (
							<AccountCard
								key={acc.address}
								account={{
									name: acc.name || "Spektr Account",
									ss58: acc.address,
									eth: ss58ToH160(acc.address),
									type: "spektr",
								}}
								info={accountInfos[acc.address]}
								badge={typeBadge.spektr}
								onFund={() =>
									fundAccount(acc.address, acc.name || "Spektr account")
								}
								connected={connected}
							/>
						))}
					</div>
				)}
			</div>

			{/* Extension Wallets */}
			<div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-4">
				<h2 className="text-lg font-semibold text-gray-300">Browser Extension Wallets</h2>
				{connectedWallet ? (
					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<span className="text-sm text-green-400">
								Connected to {walletNames[connectedWallet] || connectedWallet}
							</span>
							<button
								onClick={disconnectWallet}
								className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
							>
								Disconnect
							</button>
						</div>
						{extensionAccounts.length === 0 ? (
							<p className="text-sm text-gray-500">
								No accounts found in this wallet.
							</p>
						) : (
							extensionAccounts.map((acc) => (
								<AccountCard
									key={acc.address}
									account={{
										name: acc.name || "Unnamed",
										ss58: acc.address,
										eth: ss58ToH160(acc.address),
										type: "extension",
									}}
									info={accountInfos[acc.address]}
									badge={typeBadge.extension}
									onFund={() =>
										fundAccount(acc.address, acc.name || "Extension account")
									}
									connected={connected}
								/>
							))
						)}
					</div>
				) : availableWallets.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{availableWallets.map((name) => (
							<button
								key={name}
								onClick={() => connectWallet(name)}
								className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded text-white text-sm"
							>
								Connect {walletNames[name] || name}
							</button>
						))}
					</div>
				) : (
					<p className="text-sm text-gray-500">
						No browser extension wallets detected. Install{" "}
						<a
							href="https://polkadot.js.org/extension/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-pink-400 underline"
						>
							Polkadot.js
						</a>
						,{" "}
						<a
							href="https://www.talisman.xyz/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-pink-400 underline"
						>
							Talisman
						</a>
						, or{" "}
						<a
							href="https://www.subwallet.app/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-pink-400 underline"
						>
							SubWallet
						</a>{" "}
						to connect.
					</p>
				)}
			</div>
		</div>
	);
}

function AccountCard({
	account,
	info,
	badge,
	onFund,
	connected,
}: {
	account: DisplayAccount;
	info?: AccountInfo;
	badge: { bg: string; text: string; label: string };
	onFund: () => void;
	connected: boolean;
}) {
	return (
		<div className="bg-gray-800 rounded p-3 space-y-2">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-gray-200">{account.name}</span>
				<div className="flex gap-2 items-center">
					{info && (
						<span className="text-xs text-gray-400 font-mono">
							{formatBalance(info.balance)} | nonce: {info.nonce}
						</span>
					)}
					{connected && (
						<button
							onClick={onFund}
							className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-white text-xs"
						>
							Fund
						</button>
					)}
					<span className={`px-2 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>
						{badge.label}
					</span>
				</div>
			</div>
			<div className="space-y-1">
				<CopyableAddress label="SS58" address={account.ss58} />
				<CopyableAddress label="ETH" address={account.eth} />
			</div>
		</div>
	);
}
