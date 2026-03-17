import { type ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";
import { readNativeApi } from "~/nativeApi";
import { randomUUID } from "~/lib/utils";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { MAX_TERMINALS_PER_GROUP, type Project, type Thread } from "../types";

interface UseTerminalActionsInput {
  activeThread: Thread;
  activeProject: Project | null;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  focusComposer?: () => void;
}

export function useTerminalActions(input: UseTerminalActionsInput) {
  const [terminalFocusRequestId, setTerminalFocusRequestId] = useState(0);
  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadId, input.activeThread.id),
  );
  const storeSetTerminalOpen = useTerminalStateStore((state) => state.setTerminalOpen);
  const storeSetTerminalHeight = useTerminalStateStore((state) => state.setTerminalHeight);
  const storeSplitTerminal = useTerminalStateStore((state) => state.splitTerminal);
  const storeNewTerminal = useTerminalStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalStateStore((state) => state.closeTerminal);

  const activeTerminalGroup = useMemo(
    () =>
      terminalState.terminalGroups.find(
        (group) => group.id === terminalState.activeTerminalGroupId,
      ) ??
      terminalState.terminalGroups.find((group) =>
        group.terminalIds.includes(terminalState.activeTerminalId),
      ) ??
      null,
    [
      terminalState.activeTerminalGroupId,
      terminalState.activeTerminalId,
      terminalState.terminalGroups,
    ],
  );
  const hasReachedSplitLimit =
    (activeTerminalGroup?.terminalIds.length ?? 0) >= MAX_TERMINALS_PER_GROUP;

  const setTerminalOpen = useCallback(
    (open: boolean) => {
      storeSetTerminalOpen(input.activeThread.id, open);
    },
    [input.activeThread.id, storeSetTerminalOpen],
  );
  const setTerminalHeight = useCallback(
    (height: number) => {
      storeSetTerminalHeight(input.activeThread.id, height);
    },
    [input.activeThread.id, storeSetTerminalHeight],
  );
  const toggleTerminalVisibility = useCallback(() => {
    setTerminalOpen(!terminalState.terminalOpen);
  }, [setTerminalOpen, terminalState.terminalOpen]);
  const splitTerminal = useCallback(() => {
    if (hasReachedSplitLimit) return;
    const terminalId = `terminal-${randomUUID()}`;
    storeSplitTerminal(input.activeThread.id, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
  }, [hasReachedSplitLimit, input.activeThread.id, storeSplitTerminal]);
  const createNewTerminal = useCallback(() => {
    const terminalId = `terminal-${randomUUID()}`;
    storeNewTerminal(input.activeThread.id, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
  }, [input.activeThread.id, storeNewTerminal]);
  const activateTerminal = useCallback(
    (terminalId: string) => {
      storeSetActiveTerminal(input.activeThread.id, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [input.activeThread.id, storeSetActiveTerminal],
  );
  const closeTerminal = useCallback(
    (terminalId: string) => {
      const api = readNativeApi();
      if (!api) return;
      const isFinalTerminal = terminalState.terminalIds.length <= 1;
      const fallbackExitWrite = () =>
        api.terminal
          .write({ threadId: input.activeThread.id, terminalId, data: "exit\n" })
          .catch(() => undefined);
      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal
              .clear({ threadId: input.activeThread.id, terminalId })
              .catch(() => undefined);
          }
          await api.terminal.close({
            threadId: input.activeThread.id,
            terminalId,
            deleteHistory: true,
          });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }
      storeCloseTerminal(input.activeThread.id, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
      input.focusComposer?.();
    },
    [input, storeCloseTerminal, terminalState.terminalIds.length],
  );

  return {
    terminalState,
    terminalFocusRequestId,
    hasReachedSplitLimit,
    setTerminalOpen,
    setTerminalHeight,
    toggleTerminalVisibility,
    splitTerminal,
    createNewTerminal,
    activateTerminal,
    closeTerminal,
    storeNewTerminal,
    storeSetActiveTerminal,
    activeThreadId: input.activeThread.id,
    activeProject: input.activeProject,
    setTerminalFocusRequestId,
  };
}
