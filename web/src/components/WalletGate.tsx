import { Outlet } from "react-router-dom";
import { ConnectButton } from "@luno-kit/ui";
import { ConnectionStatus, useAccount, useStatus } from "@luno-kit/react";

/**
 * Renders app routes only after a browser wallet account is connected via LunoKit.
 */
export default function WalletGate() {
	const { address } = useAccount();
	const status = useStatus();

	if (status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting) {
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
			</div>
		);
	}

	if (!address) {
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
			</div>
		);
	}

	return <Outlet />;
}
