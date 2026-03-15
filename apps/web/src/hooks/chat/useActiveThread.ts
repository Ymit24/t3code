import { ThreadId, DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import { useMemo } from "react";
import { buildLocalDraftThread } from "~/components/ChatView.logic";
import { useChatViewStore } from "~/components/ChatViewStoreProvider";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useStore } from "~/store";
import { Thread } from "~/types";

export default function useActiveThread(threadId: ThreadId): Thread | undefined {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);

  const serverThread = threads.find((t) => t.id === threadId);
  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const localDraftStoreError = useChatViewStore((store) => store.localDraftError);
  const fallbackDraftProject = projects.find((project) => project.id === draftThread?.projectId);

  // TODO: might be able to simplify this
  const localDraftError = serverThread ? null : localDraftStoreError;

  const localDraftThread = useMemo(
    () =>
      draftThread
        ? buildLocalDraftThread(
          threadId,
          draftThread,
          fallbackDraftProject?.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
          localDraftError,
        )
        : undefined,
    [draftThread, fallbackDraftProject?.model, localDraftError, threadId],
  );

  const activeThread = serverThread ?? localDraftThread;

  return activeThread;
}
