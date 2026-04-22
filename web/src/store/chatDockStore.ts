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
}

interface ChatDockState {
	entries: ChatDockEntry[];
	openChat: (orderId: bigint) => void;
	closeChat: (orderId: bigint) => void;
	toggleMinimized: (orderId: bigint) => void;
	focusChat: (orderId: bigint) => void;
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
	openChat: (orderId) =>
		set((state) => {
			const key = orderKey(orderId);
			const now = Date.now();
			const existing = state.entries.find((e) => orderKey(e.orderId) === key);
			if (existing) {
				return {
					entries: state.entries.map((e) =>
						orderKey(e.orderId) === key
							? { ...e, minimized: false, openedAtMs: now }
							: e,
					),
				};
			}
			return {
				entries: [...state.entries, { orderId, minimized: false, openedAtMs: now }],
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
}));
