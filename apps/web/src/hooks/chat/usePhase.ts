import { useChatViewStore } from "~/components/ChatViewStoreProvider";
import { derivePhase } from "~/session-logic";
import { Thread } from "~/types";

export default function usePhase(activeThread: Thread) {
  const phase = derivePhase(activeThread?.session ?? null);

  const sendPhase = useChatViewStore((store) => store.sendPhase);
  const isRevertingCheckpoint = useChatViewStore((store) => store.isRevertingCheckpoint);

  const isSendBusy = sendPhase !== "idle";
  const isPreparingWorktree = sendPhase === "preparing-worktree";
  const isWorking = phase === "running" || isSendBusy || isRevertingCheckpoint;

  return {
    phase,
    sendPhase,
    isSendBusy,
    isPreparingWorktree,
    isWorking,
  };
}
