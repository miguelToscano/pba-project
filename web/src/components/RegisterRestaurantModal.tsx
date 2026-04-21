import { useEffect, useState } from "react";
import { requireUtf8MaxBytes, utf8ByteLength } from "../utils/utf8Bounds";

/** Matches `pallet_template` `BoundedVec` limits. */
export const MAX_RESTAURANT_NAME_BYTES = 128;
export const MAX_MENU_ITEMS = 64;
export const MAX_MENU_ITEM_NAME_BYTES = 64;
export const MAX_MENU_ITEM_DESC_BYTES = 256;

const U128_MAX = (1n << 128n) - 1n;

export type RestaurantFormMenuRow = { name: string; description: string; price: string };

export type RestaurantMenuItemPayload = { name: string; description: string; price: bigint };

export type RestaurantRegistrationPayload = {
	restaurantName: string;
	menuItems: RestaurantMenuItemPayload[];
};

type Props = {
	open: boolean;
	onClose: () => void;
	isSubmitting: boolean;
	onConfirm: (payload: RestaurantRegistrationPayload) => Promise<void>;
};

export default function RegisterRestaurantModal({ open, onClose, isSubmitting, onConfirm }: Props) {
	const [restaurantName, setRestaurantName] = useState("");
	const [rows, setRows] = useState<RestaurantFormMenuRow[]>([
		{ name: "", description: "", price: "0" },
	]);
	const [formError, setFormError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setRestaurantName("");
		setRows([{ name: "", description: "", price: "0" }]);
		setFormError(null);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && !isSubmitting) onClose();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, isSubmitting, onClose]);

	if (!open) return null;

	const nameBytes = utf8ByteLength(restaurantName.trim());

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFormError(null);
		const trimmedName = restaurantName.trim();
		if (!trimmedName) {
			setFormError("Restaurant name is required.");
			return;
		}
		try {
			requireUtf8MaxBytes(trimmedName, MAX_RESTAURANT_NAME_BYTES, "Restaurant name");
		} catch (err) {
			setFormError(err instanceof Error ? err.message : String(err));
			return;
		}

		const menuItems: RestaurantMenuItemPayload[] = [];
		for (let i = 0; i < rows.length; i++) {
			const nm = rows[i]!.name.trim();
			const desc = rows[i]!.description;
			const priceStr = rows[i]!.price.trim();
			if (!nm) continue;
			try {
				requireUtf8MaxBytes(nm, MAX_MENU_ITEM_NAME_BYTES, `Menu item ${i + 1} name`);
				requireUtf8MaxBytes(desc, MAX_MENU_ITEM_DESC_BYTES, `Menu item ${i + 1} description`);
			} catch (err) {
				setFormError(err instanceof Error ? err.message : String(err));
				return;
			}
			if (priceStr === "" || !/^\d+$/.test(priceStr)) {
				setFormError(`Menu item ${i + 1}: price must be a whole number ≥ 0 (no decimals).`);
				return;
			}
			let price: bigint;
			try {
				price = BigInt(priceStr);
			} catch {
				setFormError(`Menu item ${i + 1}: price is not a valid integer.`);
				return;
			}
			if (price < 0n || price > U128_MAX) {
				setFormError(`Menu item ${i + 1}: price must fit in u128 (0 … ${U128_MAX.toString()}).`);
				return;
			}
			menuItems.push({ name: nm, description: desc, price });
		}

		if (menuItems.length > MAX_MENU_ITEMS) {
			setFormError(`At most ${MAX_MENU_ITEMS} menu items.`);
			return;
		}
		if (menuItems.length === 0) {
			setFormError("Add at least one menu item with a non-empty name.");
			return;
		}

		try {
			await onConfirm({ restaurantName: trimmedName, menuItems });
		} catch (err) {
			setFormError(err instanceof Error ? err.message : String(err));
		}
	}

	function addRow() {
		setRows((r) =>
			r.length >= MAX_MENU_ITEMS ? r : [...r, { name: "", description: "", price: "0" }],
		);
	}

	function removeRow(index: number) {
		setRows((r) => (r.length <= 1 ? r : r.filter((_, i) => i !== index)));
	}

	function updateRow(index: number, patch: Partial<RestaurantFormMenuRow>) {
		setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
	}

	return (
		<div
			className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="register-restaurant-title"
			onClick={(e) => {
				if (e.target === e.currentTarget && !isSubmitting) onClose();
			}}
		>
			<div
				className="card w-full max-w-lg max-h-[min(90vh,640px)] overflow-y-auto shadow-xl border border-white/[0.12]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3 mb-4">
					<div>
						<h2 id="register-restaurant-title" className="text-lg font-semibold font-display text-text-primary">
							Register restaurant
						</h2>
						<p className="text-sm text-text-secondary mt-1">
							Set an on-chain name and menu (UTF-8; byte limits match the template pallet).
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="shrink-0 rounded-lg px-2 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-white/[0.06] disabled:opacity-40"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
					<div>
						<label htmlFor="restaurant-name" className="label">
							Restaurant name <span className="text-text-muted font-normal">({nameBytes}/{MAX_RESTAURANT_NAME_BYTES} bytes)</span>
						</label>
						<input
							id="restaurant-name"
							type="text"
							value={restaurantName}
							onChange={(e) => setRestaurantName(e.target.value)}
							className="input-field w-full font-sans"
							placeholder="e.g. Luna Bistro"
							autoComplete="off"
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-medium text-text-primary">Menu items</span>
							<button
								type="button"
								onClick={addRow}
								disabled={isSubmitting || rows.length >= MAX_MENU_ITEMS}
								className="btn-secondary text-xs disabled:opacity-40"
							>
								Add item
							</button>
						</div>
						<p className="text-xs text-text-tertiary">
							Include at least one item with a name. Empty rows are ignored. Max {MAX_MENU_ITEMS}{" "}
							items; each name ≤ {MAX_MENU_ITEM_NAME_BYTES} bytes, description ≤{" "}
							{MAX_MENU_ITEM_DESC_BYTES} bytes (UTF-8). Price is a non-negative integer (on-chain u128,
							e.g. smallest token unit).
						</p>
						<div className="space-y-3">
							{rows.map((row, index) => (
								<div
									key={index}
									className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2"
								>
									<div className="flex items-center justify-between">
										<span className="text-xs font-medium text-text-tertiary">Item {index + 1}</span>
										{rows.length > 1 && (
											<button
												type="button"
												onClick={() => removeRow(index)}
												disabled={isSubmitting}
												className="text-xs text-accent-red/90 hover:text-accent-red disabled:opacity-40"
											>
												Remove
											</button>
										)}
									</div>
									<input
										type="text"
										value={row.name}
										onChange={(e) => updateRow(index, { name: e.target.value })}
										className="input-field w-full font-sans text-sm"
										placeholder="Dish name"
										disabled={isSubmitting}
									/>
									<textarea
										value={row.description}
										onChange={(e) => updateRow(index, { description: e.target.value })}
										rows={2}
										className="input-field w-full font-sans text-sm resize-y min-h-[52px]"
										placeholder="Description (optional)"
										disabled={isSubmitting}
									/>
									<label className="block">
										<span className="text-xs text-text-tertiary">Price (u128, whole units)</span>
										<input
											type="text"
											inputMode="numeric"
											value={row.price}
											onChange={(e) => updateRow(index, { price: e.target.value })}
											className="input-field w-full font-mono text-sm mt-1"
											placeholder="0"
											autoComplete="off"
											disabled={isSubmitting}
										/>
									</label>
								</div>
							))}
						</div>
					</div>

					{formError && <p className="text-sm text-accent-red font-medium">{formError}</p>}

					<div className="flex flex-wrap justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							disabled={isSubmitting}
							className="btn-secondary disabled:opacity-40"
						>
							Cancel
						</button>
						<button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-40">
							{isSubmitting ? "Signing…" : "Register on-chain"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
