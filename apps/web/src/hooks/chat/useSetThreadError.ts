import { ThreadId } from "@t3tools/contracts";
import { useCallback } from "react";
import { useChatViewStore } from "~/components/ChatViewStoreProvider";
import { useStore } from "~/store";

export default function useSetThreadError() {
  const threads = useStore((store) => store.threads);
  const setStoreThreadError = useStore((store) => store.setError);
  const localDraftError = useChatViewStore((store) => store.localDraftError);
  const setLocalDraftError = useChatViewStore((store) => store.setLocalDraftError);
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      if (threads.some((thread) => thread.id === targetThreadId)) {
        setStoreThreadError(targetThreadId, error);
        return;
      }
      if ((localDraftError ?? null) === error) {
        return;
      }
      setLocalDraftError(error);
    },
    [setStoreThreadError, threads, setLocalDraftError, localDraftError],
  );

  return setThreadError;
}
