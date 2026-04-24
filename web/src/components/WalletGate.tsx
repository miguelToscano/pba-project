import { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { ConnectButton } from "@luno-kit/ui";
import { ConnectionStatus, useAccount, useStatus } from "@luno-kit/react";
import { connectInjectedExtension, type InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { injectSpektrExtension, SpektrExtensionName } from "@novasamatech/product-sdk";
import { isInHost } from "../utils/host";
import { useHostAccountStore } from "../store/hostAccountStore";

// ── Shared decorative background ─────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-pattern relative flex flex-col items-center justify-center px-4">
			<div
				className="gradient-orb pointer-events-none"
				style={{ background: "#e6007a", top: "-200px", right: "-100px" }}
			/>
			<div
				className="gradient-orb pointer-events-none"
				style={{ background: "#4cc2ff", bottom: "-200px", left: "-100px" }}
			/>
			{children}
		</div>
	);
}

function shortenAddress(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ── Host path (iframe / Nova Wallet webview) ──────────────────────────────────

type SpektrStatus = "injecting" | "selecting" | "failed";

function HostWalletGate() {
	const [status, setStatus] = useState<SpektrStatus>("injecting");
	const [accounts, setAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const { address, setAccount } = useHostAccountStore();
	const unsubRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (address) return; // already selected from a previous render

		let cancelled = false;

		async function inject() {
			setStatus("injecting");
			try {
				let injected = false;
				for (let i = 0; i < 10; i++) {
					if (await injectSpektrExtension()) {
						injected = true;
						break;
					}
					if (i < 9) await new Promise((r) => setTimeout(r, 500));
				}

				if (!injected || cancelled) {
					if (!cancelled) setStatus("failed");
					return;
				}

				const ext = await connectInjectedExtension(SpektrExtensionName);
				if (cancelled) {
					ext.disconnect();
					return;
				}

				const accs = ext.getAccounts();

				unsubRef.current?.();
				unsubRef.current = ext.subscribe((updated) => {
					if (!cancelled) setAccounts([...updated]);
				});

				if (accs.length === 0) {
					setStatus("failed");
					return;
				}

				setAccounts(accs);

				if (accs.length === 1) {
					setAccount(accs[0].address, accs[0].polkadotSigner);
					// address update triggers the parent to render <Outlet />
				} else {
					setStatus("selecting");
				}
			} catch (e) {
				console.error("[Host] Spektr injection failed:", e);
				if (!cancelled) setStatus("failed");
			}
		}

		void inject();

		return () => {
			cancelled = true;
			unsubRef.current?.();
			unsubRef.current = null;
		};
	}, [address, setAccount]);

	// Account was auto-selected (1 account) or picked by user — render the app.
	if (address) return <Outlet />;

	if (status === "injecting") {
		return (
			<PageShell>
				<div className="relative z-10 card max-w-md w-full text-center space-y-4 py-10">
					<div className="flex justify-center">
						<div className="w-10 h-10 rounded-full border-2 border-polka-500 border-t-transparent animate-spin" />
					</div>
					<p className="text-text-secondary text-sm">Connecting to Polkadot Host…</p>
				</div>
			</PageShell>
		);
	}

	if (status === "selecting") {
		return (
			<PageShell>
				<div className="relative z-10 card max-w-lg w-full space-y-6 py-10 px-8">
					<div className="space-y-1">
						<h1 className="page-title text-2xl">Select an account</h1>
						<p className="text-text-secondary text-sm">
							Choose which host account to use for this session.
						</p>
					</div>
					<div className="space-y-2">
						{accounts.map((acc) => (
							<button
								key={acc.address}
								onClick={() => setAccount(acc.address, acc.polkadotSigner)}
								className="w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-3 space-y-0.5"
							>
								<p className="text-sm font-semibold text-text-primary">
									{acc.name ?? "Host Account"}
								</p>
								<p className="text-xs font-mono text-text-muted">
									{shortenAddress(acc.address)}
								</p>
							</button>
						))}
					</div>
				</div>
			</PageShell>
		);
	}

	// failed
	return (
		<PageShell>
			<div className="relative z-10 card max-w-md w-full text-center space-y-4 py-10 px-8">
				<p className="text-text-primary font-semibold">
					Could not connect to Polkadot Host
				</p>
				<p className="text-text-secondary text-sm">
					No accounts were returned. Make sure this app is opened inside a compatible
					host.
				</p>
				<button onClick={() => setStatus("injecting")} className="btn-primary mx-auto">
					Retry
				</button>
			</div>
		</PageShell>
	);
}

// ── Standalone path (browser extensions via LunoKit) ─────────────────────────

function StandaloneConnectScreen() {
	return (
		<PageShell>
			<div className="relative z-10 card max-w-lg w-full space-y-8 py-12 px-8 text-center">
				<div className="space-y-2">
					<h1 className="page-title text-2xl sm:text-3xl">Connect your wallet</h1>
					<p className="text-text-secondary text-sm sm:text-base leading-relaxed">
						This app unlocks after you connect a Polkadot browser extension
						(Polkadot.js, SubWallet, Talisman, …). Your keys stay in the extension.
					</p>
				</div>
				<div className="flex justify-center">
					<ConnectButton label={"Connect wallet"} displayPreference="name" />
				</div>
			</div>
		</PageShell>
	);
}

// ── Root gate ─────────────────────────────────────────────────────────────────

export default function WalletGate() {
	const { address: lunoAddress } = useAccount();
	const status = useStatus();
	const hostAddress = useHostAccountStore((s) => s.address);

	// Already authenticated via either path.
	if (lunoAddress || hostAddress) return <Outlet />;

	// Host context (iframe / webview): skip LunoKit — extensions don't inject here.
	if (isInHost()) return <HostWalletGate />;

	// Standalone: LunoKit connection in progress.
	if (status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting) {
		return (
			<PageShell>
				<div className="relative z-10 card max-w-md w-full text-center space-y-4 py-10">
					<div className="flex justify-center">
						<div className="w-10 h-10 rounded-full border-2 border-polka-500 border-t-transparent animate-spin" />
					</div>
					<p className="text-text-secondary text-sm">
						{status === ConnectionStatus.Disconnecting
							? "Disconnecting…"
							: "Connecting wallet…"}
					</p>
				</div>
			</PageShell>
		);
	}

	return <StandaloneConnectScreen />;
}
