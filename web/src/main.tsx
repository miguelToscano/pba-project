import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LunoKitProvider } from "@luno-kit/ui";
import App from "./App";
import { injectLunoUiStyles } from "./setupLunoUiStyles";
import WalletGate from "./components/WalletGate";
import { lunokitConfig } from "./config/lunokit";
import "./index.css";

injectLunoUiStyles();

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
		},
	},
});

const HomePage = lazy(() => import("./pages/HomePage"));
const PalletPage = lazy(() => import("./pages/PalletPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const StatementStorePage = lazy(() => import("./pages/StatementStorePage"));

const routeFallback = (
	<div className="card animate-pulse">
		<div className="h-4 w-32 rounded bg-white/[0.06]" />
		<div className="mt-3 h-3 w-48 rounded bg-white/[0.04]" />
	</div>
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<LunoKitProvider config={lunokitConfig}>
				<HashRouter>
					<Routes>
						<Route element={<WalletGate />}>
							<Route element={<App />}>
								<Route
									index
									element={
										<Suspense fallback={routeFallback}>
											<HomePage />
										</Suspense>
									}
								/>
								<Route
									path="pallet"
									element={
										<Suspense fallback={routeFallback}>
											<PalletPage />
										</Suspense>
									}
								/>
								<Route
									path="accounts"
									element={
										<Suspense fallback={routeFallback}>
											<AccountsPage />
										</Suspense>
									}
								/>
								<Route
									path="statements"
									element={
										<Suspense fallback={routeFallback}>
											<StatementStorePage />
										</Suspense>
									}
								/>
							</Route>
						</Route>
					</Routes>
				</HashRouter>
			</LunoKitProvider>
		</QueryClientProvider>
	</StrictMode>,
);
