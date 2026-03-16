import { DraftThreadEnvMode, useComposerDraftStore } from "~/composerDraftStore";
import { Thread } from "~/types";
import useIsServer from "./useIsServer";
import { useCallback } from "react";
import useScheduleComposerFocus from "./useScheduleComposerFocus";

export default function useEnvMode(activeThread: Thread) {
  const isServer = useIsServer(activeThread);
  const isLocalDraftThread = !isServer;

  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[activeThread.id] ?? null,
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);

  const envMode: DraftThreadEnvMode = activeThread.worktreePath
    ? "worktree"
    : isLocalDraftThread
      ? (draftThread?.envMode ?? "local")
      : "local";

  const scheduleComposerFocus = useScheduleComposerFocus();

  const onEnvModeChange = useCallback(
    (mode: DraftThreadEnvMode) => {
      if (isLocalDraftThread) {
        setDraftThreadContext(activeThread.id, { envMode: mode });
      }
      scheduleComposerFocus();
    },
    [activeThread, isLocalDraftThread, scheduleComposerFocus, setDraftThreadContext],
  );

  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "closed")),
  );

  return {
    envMode,
    onEnvModeChange,
    envLocked,
  };
}
