import { type ThreadId } from "@t3tools/contracts";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import BranchToolbar from "../BranchToolbar";
import { PullRequestThreadDialog } from "../PullRequestThreadDialog";
import { stripDiffSearchParams } from "../../diffRouteSearch";
import { readNativeApi } from "../../nativeApi";
import { newCommandId, newThreadId } from "../../lib/utils";
import { derivePhase } from "../../session-logic";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type ChatMessage, type Project, type Thread } from "../../types";
import { useComposerDraftStore } from "../../composerDraftStore";
import { revokeUserMessagePreviewUrls, type SendPhase } from "../ChatView.logic";
import { ChatComposer } from "./ChatComposer";
import { ChatImageLightbox } from "./ChatImageLightbox";
import { ChatMessagesPane } from "./ChatMessagesPane";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import { useChatComposerController } from "./useChatComposerController";
import { useChatMessagesPaneController } from "./useChatMessagesPaneController";

interface PullRequestDialogState {
  initialReference: string | null;
  key: number;
}

interface ChatThreadContentProps {
  activePlan: ReturnType<typeof import("../../session-logic").deriveActivePlanState>;
  activeProject: Project | undefined;
  activeProposedPlan: Thread["proposedPlans"][number] | null;
  activeThread: Thread;
  gitCwd: string | null;
  isGitRepo: boolean;
  isLocalDraftThread: boolean;
  isServerThread: boolean;
  planSidebarDismissedForTurnRef: MutableRefObject<string | null>;
  planSidebarOpen: boolean;
  resolvedTheme: "light" | "dark" | undefined;
  runProjectScript: (
    script: Project["scripts"][number],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      worktreePath?: string | null;
      preferNewTerminal?: boolean;
      rememberAsLastInvoked?: boolean;
      allowLocalDraftThread?: boolean;
    },
  ) => Promise<void>;
  setPlanSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  terminalOpen: boolean;
  threadId: ThreadId;
  togglePlanSidebar: () => void;
  markPlanSidebarOpenOnNextThread: () => void;
}

export function ChatThreadContent({
  activePlan,
  activeProject,
  activeProposedPlan,
  activeThread,
  gitCwd,
  isGitRepo,
  isLocalDraftThread,
  isServerThread,
  planSidebarDismissedForTurnRef,
  planSidebarOpen,
  resolvedTheme,
  runProjectScript,
  setPlanSidebarOpen,
  setThreadError,
  terminalOpen,
  threadId,
  togglePlanSidebar,
  markPlanSidebarOpenOnNextThread,
}: ChatThreadContentProps) {
  const navigate = useNavigate();
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<ChatMessage[]>([]);
  const [pullRequestDialogState, setPullRequestDialogState] = useState<PullRequestDialogState | null>(null);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [sendStartedAt, setSendStartedAt] = useState<string | null>(null);
  const [isConnecting] = useState(false);
  const [isRevertingCheckpoint, setIsRevertingCheckpoint] = useState(false);
  const terminalOpenByThreadRef = useRef<Record<string, boolean>>({});
  const phase = derivePhase(activeThread.session ?? null);
  const isSendBusy = sendPhase !== "idle";

  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const getDraftThreadByProjectId = useComposerDraftStore((store) => store.getDraftThreadByProjectId);
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const clearProjectDraftThreadId = useComposerDraftStore((store) => store.clearProjectDraftThreadId);

  const messagesController = useChatMessagesPaneController({
    activeThread,
    gitCwd,
    isConnecting,
    isRevertingCheckpoint,
    isSendBusy,
    onExpandTimelineImage: setExpandedImage,
    onOpenTurnDiff: useCallback(
      (turnId, filePath) => {
        void navigate({
          to: "/$threadId",
          params: { threadId },
          search: (previous) => {
            const rest = stripDiffSearchParams(previous);
            return filePath
              ? { ...rest, diff: "1", diffTurnId: turnId, diffFilePath: filePath }
              : { ...rest, diff: "1", diffTurnId: turnId };
          },
        });
      },
      [navigate, threadId],
    ),
    onRevertToTurnCount: useCallback(
      (turnCount: number) => {
        const api = readNativeApi();
        if (!api || isRevertingCheckpoint) return;
        if (phase === "running" || isSendBusy || isConnecting) {
          setThreadError(activeThread.id, "Interrupt the current turn before reverting checkpoints.");
          return;
        }

        void (async () => {
          const confirmed = await api.dialogs.confirm(
            [
              `Revert this thread to checkpoint ${turnCount}?`,
              "This will discard newer messages and turn diffs in this thread.",
              "This action cannot be undone.",
            ].join("\n"),
          );
          if (!confirmed) {
            return;
          }

          setIsRevertingCheckpoint(true);
          setThreadError(activeThread.id, null);
          try {
            await api.orchestration.dispatchCommand({
              type: "thread.checkpoint.revert",
              commandId: newCommandId(),
              threadId: activeThread.id,
              turnCount,
              createdAt: new Date().toISOString(),
            });
          } catch (err) {
            setThreadError(
              activeThread.id,
              err instanceof Error ? err.message : "Failed to revert thread state.",
            );
          }
          setIsRevertingCheckpoint(false);
        })();
      },
      [activeThread.id, isConnecting, isRevertingCheckpoint, isSendBusy, phase, setThreadError],
    ),
    optimisticUserMessages,
    resolvedTheme,
    sendStartedAt,
    setOptimisticUserMessages,
    workspaceRoot: activeProject?.cwd ?? undefined,
  });

  const composerController = useChatComposerController({
    activePlan,
    activeProject,
    activeProposedPlan,
    activeThread,
    forceStickToBottom: messagesController.forceStickToBottom,
    gitCwd,
    isConnecting,
    isLocalDraftThread,
    isServerThread,
    planSidebarDismissedForTurnRef,
    planSidebarOpen,
    resolvedTheme,
    runProjectScript,
    sendPhase,
    setExpandedImage,
    setOptimisticUserMessages,
    setPlanSidebarOpen,
    setSendPhase,
    setSendStartedAt,
    setThreadError,
    stickToBottomIfNeeded: messagesController.stickToBottomIfNeeded,
    threadId,
    togglePlanSidebar,
    markPlanSidebarOpenOnNextThread,
  });
  const { focusComposer, scheduleComposerFocus } = composerController.focus;
  const { resetDragState } = composerController.attachments;

  const canCheckoutPullRequestIntoThread = isLocalDraftThread;

  const openPullRequestDialog = useCallback(
    (reference?: string) => {
      if (!canCheckoutPullRequestIntoThread) {
        return;
      }
      setPullRequestDialogState({
        initialReference: reference ?? null,
        key: Date.now(),
      });
    },
    [canCheckoutPullRequestIntoThread],
  );

  const closePullRequestDialog = useCallback(() => {
    setPullRequestDialogState(null);
  }, []);

  const openOrReuseProjectDraftThread = useCallback(
    async (input: { branch: string; worktreePath: string | null; envMode: "local" | "worktree" }) => {
      if (!activeProject) {
        throw new Error("No active project is available for this pull request.");
      }
      const storedDraftThread = getDraftThreadByProjectId(activeProject.id);
      if (storedDraftThread) {
        setDraftThreadContext(storedDraftThread.threadId, input);
        setProjectDraftThreadId(activeProject.id, storedDraftThread.threadId, input);
        if (storedDraftThread.threadId !== threadId) {
          await navigate({
            to: "/$threadId",
            params: { threadId: storedDraftThread.threadId },
          });
        }
        return;
      }

      const activeDraftThread = getDraftThread(threadId);
      if (!isServerThread && activeDraftThread?.projectId === activeProject.id) {
        setDraftThreadContext(threadId, input);
        setProjectDraftThreadId(activeProject.id, threadId, input);
        return;
      }

      clearProjectDraftThreadId(activeProject.id);
      const nextThreadId = newThreadId();
      setProjectDraftThreadId(activeProject.id, nextThreadId, {
        createdAt: new Date().toISOString(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
        ...input,
      });
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });
    },
    [
      activeProject,
      clearProjectDraftThreadId,
      getDraftThread,
      getDraftThreadByProjectId,
      isServerThread,
      navigate,
      setDraftThreadContext,
      setProjectDraftThreadId,
      threadId,
    ],
  );

  const handlePreparedPullRequestThread = useCallback(
    async (input: { branch: string; worktreePath: string | null }) => {
      await openOrReuseProjectDraftThread({
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.worktreePath ? "worktree" : "local",
      });
    },
    [openOrReuseProjectDraftThread],
  );

  useEffect(() => {
    setPullRequestDialogState(null);
    setExpandedImage(null);
    resetDragState();
    setOptimisticUserMessages((existing) => {
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    setSendPhase("idle");
    setSendStartedAt(null);
  }, [resetDragState, threadId]);

  useEffect(() => {
    setIsRevertingCheckpoint(false);
  }, [activeThread.id]);

  useEffect(() => {
    const previous = terminalOpenByThreadRef.current[activeThread.id] ?? false;
    const current = terminalOpen;

    if (!previous && current) {
      terminalOpenByThreadRef.current[activeThread.id] = current;
      return;
    }
    if (previous && !current) {
      terminalOpenByThreadRef.current[activeThread.id] = current;
      const frame = window.requestAnimationFrame(() => {
        focusComposer();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    terminalOpenByThreadRef.current[activeThread.id] = current;
  }, [activeThread.id, focusComposer, terminalOpen]);

  useEffect(() => {
    if (terminalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeThread.id, focusComposer, terminalOpen]);

  const navigateExpandedImage = useCallback((direction: -1 | 1) => {
    setExpandedImage((existing) => {
      if (!existing || existing.images.length <= 1) {
        return existing;
      }
      const nextIndex =
        (existing.index + direction + existing.images.length) % existing.images.length;
      if (nextIndex === existing.index) {
        return existing;
      }
      return { ...existing, index: nextIndex };
    });
  }, []);

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatMessagesPane controller={messagesController} threadId={activeThread.id} />
        <ChatComposer controller={composerController} isGitRepo={isGitRepo} />
        {isGitRepo ? (
          <BranchToolbar
            threadId={activeThread.id}
            onEnvModeChange={composerController.thread.onEnvModeChange}
            envLocked={composerController.thread.envLocked}
            onComposerFocusRequest={scheduleComposerFocus}
            {...(canCheckoutPullRequestIntoThread
              ? { onCheckoutPullRequestRequest: openPullRequestDialog }
              : {})}
          />
        ) : null}
        {pullRequestDialogState ? (
          <PullRequestThreadDialog
            key={pullRequestDialogState.key}
            open
            cwd={activeProject?.cwd ?? null}
            initialReference={pullRequestDialogState.initialReference}
            onOpenChange={(open) => {
              if (!open) {
                closePullRequestDialog();
              }
            }}
            onPrepared={handlePreparedPullRequestThread}
          />
        ) : null}
      </div>
      <ChatImageLightbox
        expandedImage={expandedImage}
        onClose={() => {
          setExpandedImage(null);
        }}
        onNavigate={navigateExpandedImage}
      />
    </>
  );
}
