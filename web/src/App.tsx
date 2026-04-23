import { Outlet, Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@luno-kit/ui";
import { useChainStore } from "./store/chainStore";
import { useConnectionManagement } from "./hooks/useConnection";
import ChatDock from "./components/ChatDock";

export default function App() {
	const location = useLocation();
	const connected = useChainStore((s) => s.connected);

	useConnectionManagement();

	const navItems = [
		{ path: "/", label: "App" },
		{ path: "/statements", label: "Statements" },
		{ path: "/accounts", label: "Accounts" },
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			<div
				className="gradient-orb"
				style={{ background: "#e6007a", top: "-260px", right: "-160px" }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#06B6D4", bottom: "-260px", left: "-160px" }}
			/>

			<nav
				className="sticky top-0 z-50 border-b backdrop-blur-2xl"
				style={{
					borderColor: "rgba(255,255,255,0.06)",
					background: "rgba(8,8,16,0.88)",
				}}
			>
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-5">
					<Link to="/" className="flex items-center gap-2.5 shrink-0 group">
						<div
							className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-105"
							style={{
								background: "linear-gradient(135deg, #e6007a 0%, #b80061 100%)",
								boxShadow:
									"0 0 20px rgba(230,0,122,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
							}}
						>
							<svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="white">
								<circle cx="8" cy="2.5" r="2" />
								<circle cx="2.5" cy="8" r="2" />
								<circle cx="13.5" cy="8" r="2" />
								<circle cx="8" cy="13.5" r="2" />
								<circle cx="8" cy="8" r="1.5" opacity="0.65" />
							</svg>
						</div>
						<div className="flex flex-col leading-none gap-0.5">
							<span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-text-tertiary font-mono">
								Polkadot
							</span>
							<span className="text-[15px] font-bold text-text-primary font-display tracking-tight">
								Eats
							</span>
						</div>
					</Link>

					<div className="flex gap-0.5 overflow-x-auto">
						{navItems.map((item) => {
							const active = location.pathname === item.path;
							return (
								<Link
									key={item.path}
									to={item.path}
									className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
										active
											? "text-white"
											: "text-text-secondary hover:text-text-primary hover:bg-white/[0.05]"
									}`}
								>
									{active && (
										<span
											className="absolute inset-0 rounded-lg"
											style={{
												background: "rgba(230,0,122,0.14)",
												border: "1px solid rgba(230,0,122,0.24)",
											}}
										/>
									)}
									<span className="relative">{item.label}</span>
								</Link>
							);
						})}
					</div>

					<div className="ml-auto flex items-center gap-3 shrink-0 min-w-0">
						<div
							className="hidden sm:flex items-center gap-2 text-xs text-text-tertiary"
							title="Substrate RPC connection"
						>
							<span
								className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
									connected ? "bg-accent-green" : "bg-text-muted"
								}`}
								style={
									connected ? { boxShadow: "0 0 8px rgba(16,185,129,0.7)" } : {}
								}
							/>
							<span className="hidden md:inline font-mono text-[11px]">
								{connected ? "connected" : "offline"}
							</span>
						</div>
						<ConnectButton
							chainStatus="icon"
							accountStatus="full"
							showBalance={true}
							displayPreference="name"
						/>
					</div>
				</div>
			</nav>

			<main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
				<Outlet />
			</main>

			<ChatDock />
		</div>
	);
}
