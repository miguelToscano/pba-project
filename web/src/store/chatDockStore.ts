import { create } from "zustand";

/**
 * A single chat window's view state. We key everything by `orderId` (as a
 * stringified bigint) since the authoritative thread identity on-chain is
 * the order id — different chats for the same order should always merge.
 */
export interface ChatDockEntry {
	orderId: bigint;
	minimized: boolean;
	/** When it was last focused/reopened, used to order the windows in the dock. */
	openedAtMs: number;
	/**
	 * Message the opener wants auto-sent as soon as the chat is ready.
	 * Used e.g. when the rider confirms pickup and we want to auto-notify
	 * the customer with "I'm on my way!". Cleared after the `ChatWindow`
	 * successfully submits it.
	 */
	pendingOutgoingMessage: string | null;
}

interface ChatDockState {
	entries: ChatDockEntry[];
	/** Opens (or focuses) a chat window. If `initialMessage` is provided, the
	 *  window will auto-send it once the chat is ready. */
	openChat: (orderId: bigint, initialMessage?: string) => void;
	closeChat: (orderId: bigint) => void;
	toggleMinimized: (orderId: bigint) => void;
	focusChat: (orderId: bigint) => void;
	/** Called by `ChatWindow` once it has successfully sent the queued message. */
	clearPendingOutgoingMessage: (orderId: bigint) => void;
}

function orderKey(id: bigint): string {
	return id.toString();
}

/**
 * Global, in-memory state for the Messenger-style chat dock. Not persisted to
 * localStorage on purpose: the chat windows are ephemeral UI — refreshing the
 * page should bring the user back to the normal view, not reopen every chat
 * they had minimized. The underlying chat data (delegations, messages) is
 * handled by the Statement-Store-backed `useChat` hook separately.
 */
export const useChatDockStore = create<ChatDockState>((set) => ({
	entries: [],
	openChat: (orderId, initialMessage) =>
		set((state) => {
			const key = orderKey(orderId);
			const now = Date.now();
			const existing = state.entries.find((e) => orderKey(e.orderId) === key);
			if (existing) {
				return {
					entries: state.entries.map((e) =>
						orderKey(e.orderId) === key
							? {
									...e,
									minimized: false,
									openedAtMs: now,
									// Don't clobber an already-queued message with `undefined`
									// if the caller didn't pass a new one.
									pendingOutgoingMessage:
										initialMessage ?? e.pendingOutgoingMessage,
								}
							: e,
					),
				};
			}
			return {
				entries: [
					...state.entries,
					{
						orderId,
						minimized: false,
						openedAtMs: now,
						pendingOutgoingMessage: initialMessage ?? null,
					},
				],
			};
		}),
	closeChat: (orderId) =>
		set((state) => ({
			entries: state.entries.filter((e) => orderKey(e.orderId) !== orderKey(orderId)),
		})),
	toggleMinimized: (orderId) =>
		set((state) => ({
			entries: state.entries.map((e) =>
				orderKey(e.orderId) === orderKey(orderId)
					? { ...e, minimized: !e.minimized, openedAtMs: Date.now() }
					: e,
			),
		})),
	focusChat: (orderId) =>
		set((state) => ({
			entries: state.entries.map((e) =>
				orderKey(e.orderId) === orderKey(orderId)
					? { ...e, minimized: false, openedAtMs: Date.now() }
					: e,
			),
		})),
	clearPendingOutgoingMessage: (orderId) =>
		set((state) => ({
			entries: state.entries.map((e) =>
				orderKey(e.orderId) === orderKey(orderId)
					? { ...e, pendingOutgoingMessage: null }
					: e,
			),
		})),
}));
