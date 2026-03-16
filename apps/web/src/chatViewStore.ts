import { ThreadId } from "@t3tools/contracts";
import { createStore } from "zustand";
import { PullRequestDialogState, SendPhase } from "./components/ChatView.logic";
import { ChatMessage } from "./types";
import { ExpandedImagePreview } from "./components/chat/ExpandedImagePreview";

export type ChatViewStoreState = {
  localDraftError: string | null;
  terminalFocusRequestId: number;
  sendPhase: SendPhase;
  sendStartedAt: string | null;

  isRevertingCheckpoint: boolean;

  optimisticUserMessages: ChatMessage[];
  pullRequestDialogState: PullRequestDialogState | null;

  expandedImage: ExpandedImagePreview | null;

  setLocalDraftError: (error: string | null) => void;

  increaseTerminalFocusRequestId: () => void;
  openExpandImage: (expandedImage: ExpandedImagePreview) => void;
  closeExpandedImage: () => void;

  setPullRequestDialogState: (pullRequestDialogState: PullRequestDialogState | null) => void;

  setIsRevertingCheckpoint: (isRevertingCheckpoint: boolean) => void;

  setSendStartedAt: (sendStartedAt: string | null) => void;

  composerFocusRequestId: number;
  focusComposer: () => void;
};

export function createChatViewStore(threadId: ThreadId) {
  return createStore<ChatViewStoreState>((set, get) => ({
    localDraftError: null,
    terminalFocusRequestId: 0,
    sendPhase: "idle",
    sendStartedAt: null,
    isRevertingCheckpoint: false,
    optimisticUserMessages: [],
    expandedImage: null,
    pullRequestDialogState: null,
    composerFocusRequestId: 0,
    setLocalDraftError: (error) => set({ localDraftError: error }),
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
        pullRequestDialogState,
      });
    },
    focusComposer: () => {
      set((state) => ({ composerFocusRequestId: state.composerFocusRequestId + 1 }));
    },
    setIsRevertingCheckpoint: (isRevertingCheckpoint) => {
      set({ isRevertingCheckpoint });
    },
    setSendStartedAt: (sendStartedAt) => {
      set({ sendStartedAt });
    },
  }));
}
