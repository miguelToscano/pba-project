import { useChatDockStore } from "../store/chatDockStore";
import ChatWindow from "./ChatWindow";

/**
 * Fixed-position dock that renders every open chat window in a row at the
 * bottom-right of the viewport, Messenger-style. The parent container is
 * `pointer-events-none` so the dock does not swallow clicks on the page
 * behind it; each window re-enables pointer events on itself.
 */
export default function ChatDock() {
	const entries = useChatDockStore((s) => s.entries);

	if (entries.length === 0) return null;

	// Most-recently-focused window sits furthest right, nearest the user's
	// attention; older ones cascade to the left.
	const ordered = [...entries].sort((a, b) => a.openedAtMs - b.openedAtMs);

	return (
		<div
			aria-label="Chat dock"
			className="pointer-events-none fixed bottom-0 right-4 z-40 flex items-end gap-3"
		>
			{ordered.map((entry) => (
				<ChatWindow
					key={entry.orderId.toString()}
					orderId={entry.orderId}
					minimized={entry.minimized}
				/>
			))}
		</div>
	);
}
