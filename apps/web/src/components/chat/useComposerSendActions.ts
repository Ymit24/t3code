import {
  type CodexReasoningEffort,
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSlug,
  type OrchestrationReadModel,
  type ProjectScript,
  type ProviderInteractionMode,
  type ProviderKind,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useRef } from "react";

import { parseStandaloneComposerSlashCommand, type ComposerTrigger, detectComposerTrigger } from "../../composer-logic";
import { type ComposerImageAttachment } from "../../composerDraftStore";
import { readNativeApi } from "../../nativeApi";
import { buildPlanImplementationPrompt, buildPlanImplementationThreadTitle, resolvePlanFollowUpSubmission } from "../../proposedPlan";
import { derivePhase } from "../../session-logic";
import { type ChatMessage, type Project, type Thread } from "../../types";
import { newCommandId, newMessageId, newThreadId } from "../../lib/utils";
import { truncateTitle } from "../../truncateTitle";
import {
  buildTemporaryWorktreeBranchName,
  cloneComposerImageForRetry,
  readFileAsDataUrl,
  revokeUserMessagePreviewUrls,
  type SendPhase,
} from "../ChatView.logic";
import { gitCreateWorktreeMutationOptions } from "../../lib/gitReactQuery";
import { setupProjectScript } from "~/projectScripts";
import { toastManager } from "../ui/toast";

const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";

interface UseComposerSendActionsArgs {
  activePendingApproval: unknown | null;
  activePendingProgress: {
    isLastQuestion: boolean;
  } | null;
  activePendingUserInput: { requestId: string } | null;
  activeProject: Project | undefined;
  activeProposedPlan: Thread["proposedPlans"][number] | null;
  activeThread: Thread;
  addComposerImagesToDraft: (images: ComposerImageAttachment[]) => void;
  clearComposerDraftContent: (threadId: ThreadId) => void;
  composerImages: ComposerImageAttachment[];
  composerImagesRef: MutableRefObject<ComposerImageAttachment[]>;
  envMode: "local" | "worktree";
  forceStickToBottom: () => void;
  handleInteractionModeChange: (mode: ProviderInteractionMode) => void | Promise<void>;
  interactionMode: ProviderInteractionMode;
  isConnecting: boolean;
  isLocalDraftThread: boolean;
  isServerThread: boolean;
  markPlanSidebarOpenOnNextThread: () => void;
  onAdvanceActivePendingUserInput: () => void;
  planSidebarDismissedForTurnRef: MutableRefObject<string | null>;
  prompt: string;
  promptRef: MutableRefObject<string>;
  providerOptionsForDispatch:
    | {
        codex?: {
          binaryPath?: string;
          homePath?: string;
        };
      }
    | undefined;
  runProjectScript: (
    script: ProjectScript,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      worktreePath?: string | null;
      preferNewTerminal?: boolean;
      rememberAsLastInvoked?: boolean;
      allowLocalDraftThread?: boolean;
    },
  ) => Promise<void>;
  runtimeMode: RuntimeMode;
  selectedModel: ModelSlug;
  selectedModelOptionsForDispatch:
    | {
        codex?: {
          fastMode?: true;
          reasoningEffort?: CodexReasoningEffort;
        };
      }
    | undefined;
  selectedProvider: ProviderKind;
  sendPhase: SendPhase;
  serverThread: Thread | undefined;
  setComposerCursor: Dispatch<SetStateAction<number>>;
  setComposerDraftInteractionMode: (threadId: ThreadId, mode: ProviderInteractionMode) => void;
  setComposerHighlightedItemId: Dispatch<SetStateAction<string | null>>;
  setComposerTrigger: Dispatch<SetStateAction<ComposerTrigger | null>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPlanSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setPrompt: (nextPrompt: string) => void;
  setSendPhase: Dispatch<SetStateAction<SendPhase>>;
  setSendStartedAt: Dispatch<SetStateAction<string | null>>;
  setStoreThreadBranch: (threadId: ThreadId, branch: string | null, worktreePath: string | null) => void;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  settingsEnableAssistantStreaming: boolean;
  showPlanFollowUpPrompt: boolean;
  syncServerReadModel: (snapshot: OrchestrationReadModel) => void;
  toggleResetDragState: () => void;
}

export function useComposerSendActions({
  activePendingApproval,
  activePendingProgress,
  activePendingUserInput,
  activeProject,
  activeProposedPlan,
  activeThread,
  addComposerImagesToDraft,
  clearComposerDraftContent,
  composerImages,
  composerImagesRef,
  envMode,
  forceStickToBottom,
  handleInteractionModeChange,
  interactionMode,
  isConnecting,
  isLocalDraftThread,
  isServerThread,
  markPlanSidebarOpenOnNextThread,
  onAdvanceActivePendingUserInput,
  planSidebarDismissedForTurnRef,
  prompt,
  promptRef,
  providerOptionsForDispatch,
  runProjectScript,
  runtimeMode,
  selectedModel,
  selectedModelOptionsForDispatch,
  selectedProvider,
  sendPhase,
  serverThread,
  setComposerCursor,
  setComposerDraftInteractionMode,
  setComposerHighlightedItemId,
  setComposerTrigger,
  setOptimisticUserMessages,
  setPlanSidebarOpen,
  setPrompt,
  setSendPhase,
  setSendStartedAt,
  setStoreThreadBranch,
  setThreadError,
  settingsEnableAssistantStreaming,
  showPlanFollowUpPrompt,
  syncServerReadModel,
  toggleResetDragState,
}: UseComposerSendActionsArgs) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createWorktreeMutation = useMutation(gitCreateWorktreeMutationOptions({ queryClient }));
  const sendInFlightRef = useRef(false);
  const phase = derivePhase(activeThread.session ?? null);

  const beginSendPhase = useCallback(
    (nextPhase: Exclude<SendPhase, "idle">) => {
      setSendStartedAt((current) => current ?? new Date().toISOString());
      setSendPhase(nextPhase);
    },
    [setSendPhase, setSendStartedAt],
  );
  const resetSendPhase = useCallback(() => {
    setSendPhase("idle");
    setSendStartedAt(null);
  }, [setSendPhase, setSendStartedAt]);

  useEffect(() => {
    if (sendPhase === "idle") {
      return;
    }
    if (
      phase === "running" ||
      activePendingApproval !== null ||
      activePendingUserInput !== null ||
      activeThread.error
    ) {
      resetSendPhase();
    }
  }, [
    activePendingApproval,
    activePendingUserInput,
    activeThread.error,
    phase,
    resetSendPhase,
    sendPhase,
  ]);

  const persistThreadSettingsForNextTurn = useCallback(
    async (input: {
      createdAt: string;
      interactionMode: ProviderInteractionMode;
      model?: string;
      runtimeMode: RuntimeMode;
      threadId: ThreadId;
    }) => {
      if (!serverThread) {
        return;
      }
      const api = readNativeApi();
      if (!api) {
        return;
      }

      if (input.model !== undefined && input.model !== serverThread.model) {
        await api.orchestration.dispatchCommand({
          commandId: newCommandId(),
          model: input.model,
          threadId: input.threadId,
          type: "thread.meta.update",
        });
      }

      if (input.runtimeMode !== serverThread.runtimeMode) {
        await api.orchestration.dispatchCommand({
          commandId: newCommandId(),
          createdAt: input.createdAt,
          runtimeMode: input.runtimeMode,
          threadId: input.threadId,
          type: "thread.runtime-mode.set",
        });
      }

      if (input.interactionMode !== serverThread.interactionMode) {
        await api.orchestration.dispatchCommand({
          commandId: newCommandId(),
          createdAt: input.createdAt,
          interactionMode: input.interactionMode,
          threadId: input.threadId,
          type: "thread.interaction-mode.set",
        });
      }
    },
    [serverThread],
  );

  const isSendBusy = sendPhase !== "idle";
  const isPreparingWorktree = sendPhase === "preparing-worktree";

  const onSubmitPlanFollowUp = useCallback(
    async ({
      interactionMode: nextInteractionMode,
      text,
    }: {
      interactionMode: "default" | "plan";
      text: string;
    }) => {
      const api = readNativeApi();
      if (!api || isSendBusy || isConnecting || sendInFlightRef.current) {
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const threadIdForSend = activeThread.id;
      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();

      sendInFlightRef.current = true;
      beginSendPhase("sending-turn");
      setThreadError(threadIdForSend, null);
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          createdAt: messageCreatedAt,
          id: messageIdForSend,
          role: "user",
          streaming: false,
          text: trimmed,
        },
      ]);
      forceStickToBottom();

      try {
        await persistThreadSettingsForNextTurn({
          createdAt: messageCreatedAt,
          interactionMode: nextInteractionMode,
          ...(selectedModel ? { model: selectedModel } : {}),
          runtimeMode,
          threadId: threadIdForSend,
        });
        setComposerDraftInteractionMode(threadIdForSend, nextInteractionMode);
        await api.orchestration.dispatchCommand({
          assistantDeliveryMode: settingsEnableAssistantStreaming ? "streaming" : "buffered",
          commandId: newCommandId(),
          createdAt: messageCreatedAt,
          interactionMode: nextInteractionMode,
          message: {
            attachments: [],
            messageId: messageIdForSend,
            role: "user",
            text: trimmed,
          },
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch ? { modelOptions: selectedModelOptionsForDispatch } : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          provider: selectedProvider,
          runtimeMode,
          threadId: threadIdForSend,
          type: "thread.turn.start",
        });
        if (nextInteractionMode === "default") {
          planSidebarDismissedForTurnRef.current = null;
          setPlanSidebarOpen(true);
        }
        sendInFlightRef.current = false;
      } catch (err) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        setThreadError(
          threadIdForSend,
          err instanceof Error ? err.message : "Failed to send plan follow-up.",
        );
        sendInFlightRef.current = false;
        resetSendPhase();
      }
    },
    [
      activeThread.id,
      beginSendPhase,
      forceStickToBottom,
      isConnecting,
      isSendBusy,
      persistThreadSettingsForNextTurn,
      planSidebarDismissedForTurnRef,
      providerOptionsForDispatch,
      resetSendPhase,
      runtimeMode,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedProvider,
      setComposerDraftInteractionMode,
      setOptimisticUserMessages,
      setPlanSidebarOpen,
      setThreadError,
      settingsEnableAssistantStreaming,
    ],
  );

  const onImplementPlanInNewThread = useCallback(async () => {
    const api = readNativeApi();
    if (
      !api ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      sendInFlightRef.current
    ) {
      return;
    }

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const implementationPrompt = buildPlanImplementationPrompt(planMarkdown);
    const nextThreadTitle = truncateTitle(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModel: ModelSlug =
      selectedModel ||
      (activeThread.model as ModelSlug) ||
      (activeProject.model as ModelSlug) ||
      DEFAULT_MODEL_BY_PROVIDER.codex;

    sendInFlightRef.current = true;
    beginSendPhase("sending-turn");
    const finish = () => {
      sendInFlightRef.current = false;
      resetSendPhase();
    };

    await api.orchestration
      .dispatchCommand({
        branch: activeThread.branch,
        commandId: newCommandId(),
        createdAt,
        interactionMode: "default",
        model: nextThreadModel,
        projectId: activeProject.id,
        runtimeMode,
        threadId: nextThreadId,
        title: nextThreadTitle,
        type: "thread.create",
        worktreePath: activeThread.worktreePath,
      })
      .then(() => {
        return api.orchestration.dispatchCommand({
          assistantDeliveryMode: settingsEnableAssistantStreaming ? "streaming" : "buffered",
          commandId: newCommandId(),
          createdAt,
          interactionMode: "default",
          message: {
            attachments: [],
            messageId: newMessageId(),
            role: "user",
            text: implementationPrompt,
          },
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch ? { modelOptions: selectedModelOptionsForDispatch } : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          provider: selectedProvider,
          runtimeMode,
          threadId: nextThreadId,
          type: "thread.turn.start",
        });
      })
      .then(() => api.orchestration.getSnapshot())
      .then((snapshot) => {
        syncServerReadModel(snapshot);
        markPlanSidebarOpenOnNextThread();
        return navigate({
          params: { threadId: nextThreadId },
          to: "/$threadId",
        });
      })
      .catch(async (err) => {
        await api.orchestration
          .dispatchCommand({
            commandId: newCommandId(),
            threadId: nextThreadId,
            type: "thread.delete",
          })
          .catch(() => undefined);
        await api.orchestration
          .getSnapshot()
          .then((snapshot) => {
            syncServerReadModel(snapshot);
          })
          .catch(() => undefined);
        toastManager.add({
          description:
            err instanceof Error ? err.message : "An error occurred while creating the new thread.",
          title: "Could not start implementation thread",
          type: "error",
        });
      })
      .then(finish, finish);
  }, [
    activeProject,
    activeProposedPlan,
    activeThread,
    beginSendPhase,
    isConnecting,
    isSendBusy,
    isServerThread,
    markPlanSidebarOpenOnNextThread,
    navigate,
    providerOptionsForDispatch,
    resetSendPhase,
    runtimeMode,
    selectedModel,
    selectedModelOptionsForDispatch,
    selectedProvider,
    settingsEnableAssistantStreaming,
    syncServerReadModel,
  ]);

  const onSend = useCallback(
    async (e?: { preventDefault: () => void }) => {
      e?.preventDefault();
      const api = readNativeApi();
      if (!api || isSendBusy || isConnecting || sendInFlightRef.current) return;
      if (activePendingProgress) {
        onAdvanceActivePendingUserInput();
        return;
      }
      const trimmed = prompt.trim();
      if (showPlanFollowUpPrompt && activeProposedPlan) {
        const followUp = resolvePlanFollowUpSubmission({
          draftText: trimmed,
          planMarkdown: activeProposedPlan.planMarkdown,
        });
        promptRef.current = "";
        clearComposerDraftContent(activeThread.id);
        setComposerHighlightedItemId(null);
        setComposerCursor(0);
        setComposerTrigger(null);
        await onSubmitPlanFollowUp({
          interactionMode: followUp.interactionMode,
          text: followUp.text,
        });
        return;
      }
      const standaloneSlashCommand =
        composerImages.length === 0 ? parseStandaloneComposerSlashCommand(trimmed) : null;
      if (standaloneSlashCommand) {
        await handleInteractionModeChange(standaloneSlashCommand);
        promptRef.current = "";
        clearComposerDraftContent(activeThread.id);
        setComposerHighlightedItemId(null);
        setComposerCursor(0);
        setComposerTrigger(null);
        return;
      }
      if (!trimmed && composerImages.length === 0) return;
      if (!activeProject) return;
      const threadIdForSend = activeThread.id;
      const isFirstMessage = !isServerThread || activeThread.messages.length === 0;
      const baseBranchForWorktree =
        isFirstMessage && envMode === "worktree" && !activeThread.worktreePath
          ? activeThread.branch
          : null;

      const shouldCreateWorktree =
        isFirstMessage && envMode === "worktree" && !activeThread.worktreePath;
      if (shouldCreateWorktree && !activeThread.branch) {
        setThreadError(
          threadIdForSend,
          "Select a base branch before sending in New worktree mode.",
        );
        return;
      }

      sendInFlightRef.current = true;
      beginSendPhase(baseBranchForWorktree ? "preparing-worktree" : "sending-turn");

      const composerImagesSnapshot = [...composerImages];
      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();
      const turnAttachmentsPromise = Promise.all(
        composerImagesSnapshot.map(async (image) => ({
          dataUrl: await readFileAsDataUrl(image.file),
          mimeType: image.mimeType,
          name: image.name,
          sizeBytes: image.sizeBytes,
          type: "image" as const,
        })),
      );
      const optimisticAttachments = composerImagesSnapshot.map((image) => ({
        id: image.id,
        mimeType: image.mimeType,
        name: image.name,
        previewUrl: image.previewUrl,
        sizeBytes: image.sizeBytes,
        type: "image" as const,
      }));
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          createdAt: messageCreatedAt,
          id: messageIdForSend,
          ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
          role: "user",
          streaming: false,
          text: trimmed,
        },
      ]);
      forceStickToBottom();

      setThreadError(threadIdForSend, null);
      promptRef.current = "";
      clearComposerDraftContent(threadIdForSend);
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);
      toggleResetDragState();

      let createdServerThreadForLocalDraft = false;
      let turnStartSucceeded = false;
      let nextThreadBranch = activeThread.branch;
      let nextThreadWorktreePath = activeThread.worktreePath;
      await (async () => {
        if (baseBranchForWorktree) {
          beginSendPhase("preparing-worktree");
          const newBranch = buildTemporaryWorktreeBranchName();
          const result = await createWorktreeMutation.mutateAsync({
            branch: baseBranchForWorktree,
            cwd: activeProject.cwd,
            newBranch,
          });
          nextThreadBranch = result.worktree.branch;
          nextThreadWorktreePath = result.worktree.path;
          if (isServerThread) {
            await api.orchestration.dispatchCommand({
              branch: result.worktree.branch,
              commandId: newCommandId(),
              threadId: threadIdForSend,
              type: "thread.meta.update",
              worktreePath: result.worktree.path,
            });
            setStoreThreadBranch(threadIdForSend, result.worktree.branch, result.worktree.path);
          }
        }

        let firstComposerImageName: string | null = null;
        if (composerImagesSnapshot.length > 0) {
          const firstComposerImage = composerImagesSnapshot[0];
          if (firstComposerImage) {
            firstComposerImageName = firstComposerImage.name;
          }
        }
        let titleSeed = trimmed;
        if (!titleSeed) {
          titleSeed = firstComposerImageName ? `Image: ${firstComposerImageName}` : "New thread";
        }
        const title = truncateTitle(titleSeed);
        const threadCreateModel: ModelSlug =
          selectedModel || (activeProject.model as ModelSlug) || DEFAULT_MODEL_BY_PROVIDER.codex;

        if (isLocalDraftThread) {
          await api.orchestration.dispatchCommand({
            branch: nextThreadBranch,
            commandId: newCommandId(),
            createdAt: activeThread.createdAt,
            interactionMode,
            model: threadCreateModel,
            projectId: activeProject.id,
            runtimeMode,
            threadId: threadIdForSend,
            title,
            type: "thread.create",
            worktreePath: nextThreadWorktreePath,
          });
          createdServerThreadForLocalDraft = true;
        }

        let setupScript: ProjectScript | null = null;
        if (baseBranchForWorktree) {
          setupScript = setupProjectScript(activeProject.scripts);
        }
        if (setupScript) {
          let shouldRunSetupScript = false;
          if (isServerThread) {
            shouldRunSetupScript = true;
          } else if (createdServerThreadForLocalDraft) {
            shouldRunSetupScript = true;
          }
          if (shouldRunSetupScript) {
            const setupScriptOptions: Parameters<typeof runProjectScript>[1] = {
              allowLocalDraftThread: createdServerThreadForLocalDraft,
              rememberAsLastInvoked: false,
              worktreePath: nextThreadWorktreePath,
            };
            if (nextThreadWorktreePath) {
              setupScriptOptions.cwd = nextThreadWorktreePath;
            }
            await runProjectScript(setupScript, setupScriptOptions);
          }
        }

        if (isFirstMessage && isServerThread) {
          await api.orchestration.dispatchCommand({
            commandId: newCommandId(),
            threadId: threadIdForSend,
            title,
            type: "thread.meta.update",
          });
        }

        if (isServerThread) {
          await persistThreadSettingsForNextTurn({
            createdAt: messageCreatedAt,
            interactionMode,
            ...(selectedModel ? { model: selectedModel } : {}),
            runtimeMode,
            threadId: threadIdForSend,
          });
        }

        beginSendPhase("sending-turn");
        const turnAttachments = await turnAttachmentsPromise;
        await api.orchestration.dispatchCommand({
          assistantDeliveryMode: settingsEnableAssistantStreaming ? "streaming" : "buffered",
          commandId: newCommandId(),
          createdAt: messageCreatedAt,
          interactionMode,
          message: {
            attachments: turnAttachments,
            messageId: messageIdForSend,
            role: "user",
            text: trimmed || IMAGE_ONLY_BOOTSTRAP_PROMPT,
          },
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch ? { modelOptions: selectedModelOptionsForDispatch } : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          provider: selectedProvider,
          runtimeMode,
          threadId: threadIdForSend,
          type: "thread.turn.start",
        });
        turnStartSucceeded = true;
      })().catch(async (err: unknown) => {
        if (createdServerThreadForLocalDraft && !turnStartSucceeded) {
          await api.orchestration
            .dispatchCommand({
              commandId: newCommandId(),
              threadId: threadIdForSend,
              type: "thread.delete",
            })
            .catch(() => undefined);
        }
        if (
          !turnStartSucceeded &&
          promptRef.current.length === 0 &&
          composerImagesRef.current.length === 0
        ) {
          setOptimisticUserMessages((existing) => {
            const removed = existing.filter((message) => message.id === messageIdForSend);
            for (const message of removed) {
              revokeUserMessagePreviewUrls(message);
            }
            const next = existing.filter((message) => message.id !== messageIdForSend);
            return next.length === existing.length ? existing : next;
          });
          promptRef.current = trimmed;
          setPrompt(trimmed);
          setComposerCursor(trimmed.length);
          addComposerImagesToDraft(composerImagesSnapshot.map(cloneComposerImageForRetry));
          setComposerTrigger(detectComposerTrigger(trimmed, trimmed.length));
        }
        setThreadError(
          threadIdForSend,
          err instanceof Error ? err.message : "Failed to send message.",
        );
      });
      sendInFlightRef.current = false;
      if (!turnStartSucceeded) {
        resetSendPhase();
      }
    },
    [
      activePendingProgress,
      activeProject,
      activeProposedPlan,
      activeThread,
      addComposerImagesToDraft,
      beginSendPhase,
      clearComposerDraftContent,
      composerImages,
      composerImagesRef,
      createWorktreeMutation,
      envMode,
      forceStickToBottom,
      handleInteractionModeChange,
      interactionMode,
      isConnecting,
      isLocalDraftThread,
      isSendBusy,
      isServerThread,
      onAdvanceActivePendingUserInput,
      onSubmitPlanFollowUp,
      persistThreadSettingsForNextTurn,
      prompt,
      promptRef,
      providerOptionsForDispatch,
      resetSendPhase,
      runProjectScript,
      runtimeMode,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedProvider,
      setComposerCursor,
      setComposerHighlightedItemId,
      setComposerTrigger,
      setOptimisticUserMessages,
      setPrompt,
      setStoreThreadBranch,
      setThreadError,
      settingsEnableAssistantStreaming,
      showPlanFollowUpPrompt,
      toggleResetDragState,
    ],
  );

  const onInterrupt = useCallback(async () => {
    const api = readNativeApi();
    if (!api) return;
    await api.orchestration.dispatchCommand({
      commandId: newCommandId(),
      createdAt: new Date().toISOString(),
      threadId: activeThread.id,
      type: "thread.turn.interrupt",
    });
  }, [activeThread.id]);

  return {
    actions: {
      isPreparingWorktree,
      isSendBusy,
      onImplementPlanInNewThread,
      onInterrupt,
      onSend,
      phase,
    },
  };
}
