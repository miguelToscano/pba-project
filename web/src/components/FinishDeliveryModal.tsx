import { useEffect, useRef, useState } from "react";

type Props = {
	open: boolean;
	orderId: bigint | null;
	customer: string | null;
	isSubmitting: boolean;
	/** Error bubbled up from the caller's mutation (e.g. `InvalidDeliveryPin`). */
	submitError: string | null;
	onClose: () => void;
	onConfirm: (pin: string) => Promise<void>;
};

const MAX_PIN_BYTES = 16;

/**
 * Modal dialog the rider opens from "My deliveries in progress" to enter the
 * PIN the customer reads out at handoff. Submitting calls the parent's
 * `onConfirm` (which signs and submits `finish_order_delivery`); the parent
 * is also responsible for closing the modal on success.
 *
 * Mirrors `RegisterRestaurantModal`'s styling so the dock feels consistent.
 */
export default function FinishDeliveryModal({
	open,
	orderId,
	customer,
	isSubmitting,
	submitError,
	onClose,
	onConfirm,
}: Props) {
	const [pin, setPin] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!open) return;
		// Reset per-open form state: the same modal component handles every
		// "Finish delivery" click, so we must wipe the previous session's PIN
		// and errors whenever it re-opens.
		// eslint-disable-next-line react-hooks/set-state-in-effect -- form state reset keyed on `open`
		setPin("");
		setLocalError(null);
		// Focus the PIN input the moment the modal opens so the rider can
		// start typing immediately after tapping "Finish delivery".
		requestAnimationFrame(() => inputRef.current?.focus());
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

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLocalError(null);
		const trimmed = pin.trim();
		if (!trimmed) {
			setLocalError("Enter the customer's delivery PIN.");
			return;
		}
		const bytes = new TextEncoder().encode(trimmed).length;
		if (bytes > MAX_PIN_BYTES) {
			setLocalError(`PIN is too long (max ${MAX_PIN_BYTES} bytes).`);
			return;
		}
		try {
			await onConfirm(trimmed);
		} catch (err) {
			// Keep the modal open so the rider can retry / edit the PIN; the
			// authoritative error is surfaced via `submitError`.
			setLocalError(err instanceof Error ? err.message : String(err));
		}
	}

	const orderLabel = orderId !== null ? `#${orderId.toString()}` : "";
	const shownError = localError ?? submitError;

	return (
		<div
			className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="finish-delivery-title"
			onClick={(e) => {
				if (e.target === e.currentTarget && !isSubmitting) onClose();
			}}
		>
			<div
				className="card w-full max-w-sm shadow-xl border border-white/[0.12]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3 mb-4">
					<div>
						<h2
							id="finish-delivery-title"
							className="text-lg font-semibold font-display text-text-primary"
						>
							Finish delivery {orderLabel}
						</h2>
						<p className="text-sm text-text-secondary mt-1">
							Ask the customer for their delivery PIN and enter it below. Payment is
							released once the PIN is verified on-chain.
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

				<form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
					{customer ? (
						<p className="text-xs text-text-tertiary">
							Customer:{" "}
							<span className="font-mono text-text-secondary break-all">
								{customer}
							</span>
						</p>
					) : null}

					<div>
						<label htmlFor="finish-delivery-pin" className="label">
							Delivery PIN
						</label>
						<input
							ref={inputRef}
							id="finish-delivery-pin"
							type="text"
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={MAX_PIN_BYTES}
							value={pin}
							onChange={(e) => setPin(e.target.value)}
							className="input-field w-full font-mono tracking-widest text-center text-lg"
							placeholder="••••"
							disabled={isSubmitting}
						/>
					</div>

					{shownError && (
						<p className="text-sm text-accent-red font-medium">{shownError}</p>
					)}

					<div className="flex flex-wrap justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							disabled={isSubmitting}
							className="btn-secondary disabled:opacity-40"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSubmitting || pin.trim().length === 0}
							className="btn-primary disabled:opacity-40"
						>
							{isSubmitting ? "Signing…" : "Confirm & release payment"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
