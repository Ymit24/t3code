import { ThreadId } from "@t3tools/contracts";
import { createStore } from "zustand";
import { PullRequestDialogState, SendPhase } from "./components/ChatView.logic";
import { ChatMessage } from "./types";
import { ExpandedImagePreview } from "./components/chat/ExpandedImagePreview";

export type ChatViewStoreState = {
  localDraftError: string | null;
  terminalFocusRequestId: number;
  sendPhase: SendPhase;

  isRevertingCheckpoint: boolean;

  optimisticUserMessages: ChatMessage[];
  pullRequestDialogState: PullRequestDialogState | null;

  expandedImage: ExpandedImagePreview | null;

  increaseTerminalFocusRequestId: () => void;
  openExpandImage: (expandedImage: ExpandedImagePreview) => void;
  closeExpandedImage: () => void;

  setPullRequestDialogState: (pullRequestDialogState: PullRequestDialogState | null) => void;

  composerFocusRequestId: number;
  focusComposer: () => void;
};

export function createChatViewStore(threadId: ThreadId) {
  return createStore<ChatViewStoreState>((set, get) => ({
    localDraftError: null,
    terminalFocusRequestId: 0,
    sendPhase: "idle",
    isRevertingCheckpoint: false,
    optimisticUserMessages: [],
    expandedImage: null,
    pullRequestDialogState: null,
    composerFocusRequestId: 0,
    increaseTerminalFocusRequestId: () =>
      set((state) => ({ terminalFocusRequestId: state.terminalFocusRequestId + 1 })),
    openExpandImage: (preview) => {
      set({ expandedImage: preview });
    },
    closeExpandedImage: () => {
      set({ expandedImage: null });
    },
    setPullRequestDialogState: (pullRequestDialogState) => {
      set({
        pullRequestDialogState
      })
    },
    focusComposer: () => {
      set(state => ({ composerFocusRequestId: state.composerFocusRequestId + 1 }))
    }
  }));
}
