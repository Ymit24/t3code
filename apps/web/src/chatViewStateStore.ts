/**
 * Single Zustand store for chat view UI state keyed by threadId.
 *
 * Chat view transition helpers are intentionally private to keep the public
 * API constrained to store actions/selectors.
 */

import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ThreadChatViewState {
  localDraftError: string | null;
}

interface ChatViewStateStoreState {
  chatViewStateByThreadId: Record<ThreadId, ThreadChatViewState>;
  setLocalDraftError: (threadId: ThreadId, error: string | null) => void;
  clearThreadState: (threadId: ThreadId) => void;
  removeOrphanedThreadStates: (activeThreadIds: Set<ThreadId>) => void;
}

const CHAT_VIEW_STATE_STORAGE_KEY = "t3code:chat-view-state:v1";

const DEFAULT_THREAD_CHAT_VIEW_STATE: ThreadChatViewState = Object.freeze({
  localDraftError: null,
});

function getDefaultThreadChatViewState(): ThreadChatViewState {
  return DEFAULT_THREAD_CHAT_VIEW_STATE;
}

function normalizeThreadChatViewState(state: ThreadChatViewState): ThreadChatViewState {
  const localDraftError =
    typeof state.localDraftError === "string" && state.localDraftError.length > 0
      ? state.localDraftError
      : null;
  if (state.localDraftError === localDraftError) {
    return state;
  }
  return { localDraftError };
}

function isDefaultThreadChatViewState(state: ThreadChatViewState): boolean {
  return normalizeThreadChatViewState(state).localDraftError === null;
}

export function selectThreadChatViewState(
  chatViewStateByThreadId: Record<ThreadId, ThreadChatViewState>,
  threadId: ThreadId,
): ThreadChatViewState {
  if (threadId.length === 0) {
    return getDefaultThreadChatViewState();
  }
  return chatViewStateByThreadId[threadId] ?? getDefaultThreadChatViewState();
}

function updateChatViewStateByThreadId(
  chatViewStateByThreadId: Record<ThreadId, ThreadChatViewState>,
  threadId: ThreadId,
  updater: (state: ThreadChatViewState) => ThreadChatViewState,
): Record<ThreadId, ThreadChatViewState> {
  if (threadId.length === 0) {
    return chatViewStateByThreadId;
  }

  const current = selectThreadChatViewState(chatViewStateByThreadId, threadId);
  const next = normalizeThreadChatViewState(updater(current));
  if (next === current) {
    return chatViewStateByThreadId;
  }

  if (isDefaultThreadChatViewState(next)) {
    if (chatViewStateByThreadId[threadId] === undefined) {
      return chatViewStateByThreadId;
    }
    const { [threadId]: _removed, ...rest } = chatViewStateByThreadId;
    return rest as Record<ThreadId, ThreadChatViewState>;
  }

  return {
    ...chatViewStateByThreadId,
    [threadId]: next,
  };
}

export const useChatViewStateStore = create<ChatViewStateStoreState>()(
  persist(
    (set) => ({
      chatViewStateByThreadId: {},
      setLocalDraftError: (threadId, error) =>
        set((state) => {
          const nextChatViewStateByThreadId = updateChatViewStateByThreadId(
            state.chatViewStateByThreadId,
            threadId,
            (current) => {
              const normalizedError = typeof error === "string" && error.length > 0 ? error : null;
              if (current.localDraftError === normalizedError) {
                return current;
              }
              return { ...current, localDraftError: normalizedError };
            },
          );
          if (nextChatViewStateByThreadId === state.chatViewStateByThreadId) {
            return state;
          }
          return { chatViewStateByThreadId: nextChatViewStateByThreadId };
        }),
      clearThreadState: (threadId) =>
        set((state) => {
          const nextChatViewStateByThreadId = updateChatViewStateByThreadId(
            state.chatViewStateByThreadId,
            threadId,
            () => getDefaultThreadChatViewState(),
          );
          if (nextChatViewStateByThreadId === state.chatViewStateByThreadId) {
            return state;
          }
          return { chatViewStateByThreadId: nextChatViewStateByThreadId };
        }),
      removeOrphanedThreadStates: (activeThreadIds) =>
        set((state) => {
          const orphanedIds = Object.keys(state.chatViewStateByThreadId).filter(
            (id) => !activeThreadIds.has(id as ThreadId),
          );
          if (orphanedIds.length === 0) return state;
          const next = { ...state.chatViewStateByThreadId };
          for (const id of orphanedIds) {
            delete next[id as ThreadId];
          }
          return { chatViewStateByThreadId: next };
        }),
    }),
    {
      name: CHAT_VIEW_STATE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        chatViewStateByThreadId: state.chatViewStateByThreadId,
      }),
    },
  ),
);
