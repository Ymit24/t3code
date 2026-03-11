import {
  type CodexReasoningEffort,
  type ModelSlug,
  type ProjectScript,
  type ProviderKind,
  type ThreadId,
} from "@t3tools/contracts";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  normalizeModelSlug,
  resolveModelSlugForProvider,
} from "@t3tools/shared/model";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useMemo, useRef } from "react";

import { resolveAppModelSelection, useAppSettings } from "../../appSettings";
import { useComposerDraftStore, useComposerThreadDraft } from "../../composerDraftStore";
import { isLatestTurnSettled } from "../../session-logic";
import { useStore } from "../../store";
import { type ChatMessage, type Project, type Thread } from "../../types";
import { getCustomModelOptionsByProvider, type SendPhase } from "../ChatView.logic";
import { AVAILABLE_PROVIDER_OPTIONS } from "./ProviderModelPicker";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";
import { useComposerDraftState } from "./useComposerDraftState";
import { useComposerMenuState } from "./useComposerMenuState";
import { useComposerPendingState } from "./useComposerPendingState";
import { useComposerSendActions } from "./useComposerSendActions";

type ActivePlanState = ReturnType<typeof import("../../session-logic").deriveActivePlanState>;

interface UseChatComposerControllerArgs {
  activePlan: ActivePlanState;
  activeProject: Project | undefined;
  activeProposedPlan: Thread["proposedPlans"][number] | null;
  activeThread: Thread;
  forceStickToBottom: () => void;
  gitCwd: string | null;
  isConnecting: boolean;
  isLocalDraftThread: boolean;
  isServerThread: boolean;
  markPlanSidebarOpenOnNextThread: () => void;
  planSidebarDismissedForTurnRef: MutableRefObject<string | null>;
  planSidebarOpen: boolean;
  resolvedTheme: "light" | "dark" | undefined;
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
  sendPhase: SendPhase;
  setExpandedImage: Dispatch<SetStateAction<ExpandedImagePreview | null>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPlanSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSendPhase: Dispatch<SetStateAction<SendPhase>>;
  setSendStartedAt: Dispatch<SetStateAction<string | null>>;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  stickToBottomIfNeeded: () => void;
  threadId: ThreadId;
  togglePlanSidebar: () => void;
}

export function useChatComposerController({
  activePlan,
  activeProject,
  activeProposedPlan,
  activeThread,
  forceStickToBottom,
  gitCwd,
  isConnecting,
  isLocalDraftThread,
  isServerThread,
  markPlanSidebarOpenOnNextThread,
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
  stickToBottomIfNeeded,
  threadId,
  togglePlanSidebar,
}: UseChatComposerControllerArgs) {
  const threads = useStore((store) => store.threads);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const setStoreThreadBranch = useStore((store) => store.setThreadBranch);
  const serverThread = threads.find((thread) => thread.id === threadId);
  const latestTurnSettled = isLatestTurnSettled(activeThread.latestTurn, activeThread.session ?? null);
  const { settings } = useAppSettings();
  const composerDraftSelection = useComposerThreadDraft(threadId);
  const setComposerDraftProvider = useComposerDraftStore((store) => store.setProvider);
  const setComposerDraftModel = useComposerDraftStore((store) => store.setModel);
  const setComposerDraftInteractionMode = useComposerDraftStore((store) => store.setInteractionMode);
  const setComposerDraftEffort = useComposerDraftStore((store) => store.setEffort);
  const setComposerDraftCodexFastMode = useComposerDraftStore((store) => store.setCodexFastMode);

  const sessionProvider = activeThread.session?.provider ?? null;
  const hasThreadStarted = Boolean(
    activeThread.latestTurn !== null || activeThread.messages.length > 0 || activeThread.session !== null,
  );
  const lockedProvider: ProviderKind | null = hasThreadStarted
    ? (sessionProvider ?? composerDraftSelection.provider ?? null)
    : null;
  const selectedProvider: ProviderKind = lockedProvider ?? composerDraftSelection.provider ?? "codex";
  const baseThreadModel = resolveModelSlugForProvider(
    selectedProvider,
    activeThread.model ?? activeProject?.model ?? getDefaultModel(selectedProvider),
  );
  const selectedModel = useMemo(() => {
    if (!composerDraftSelection.model) {
      return baseThreadModel;
    }
    return resolveAppModelSelection(
      selectedProvider,
      settings.customCodexModels,
      composerDraftSelection.model,
    ) as ModelSlug;
  }, [baseThreadModel, composerDraftSelection.model, selectedProvider, settings.customCodexModels]);
  const reasoningOptions = getReasoningEffortOptions(selectedProvider);
  const selectedEffort = composerDraftSelection.effort ?? getDefaultReasoningEffort(selectedProvider);
  const selectedCodexFastModeEnabled =
    selectedProvider === "codex" ? composerDraftSelection.codexFastMode : false;
  const selectedModelOptionsForDispatch = useMemo(() => {
    if (selectedProvider !== "codex") {
      return undefined;
    }
    const supportsReasoningEffort = reasoningOptions.length > 0;
    const codexOptions = {
      ...(supportsReasoningEffort && selectedEffort ? { reasoningEffort: selectedEffort } : {}),
      ...(selectedCodexFastModeEnabled ? { fastMode: true as const } : {}),
    };
    return Object.keys(codexOptions).length > 0 ? { codex: codexOptions } : undefined;
  }, [reasoningOptions.length, selectedCodexFastModeEnabled, selectedEffort, selectedProvider]);
  const providerOptionsForDispatch = useMemo(() => {
    if (!settings.codexBinaryPath && !settings.codexHomePath) {
      return undefined;
    }
    return {
      codex: {
        ...(settings.codexBinaryPath ? { binaryPath: settings.codexBinaryPath } : {}),
        ...(settings.codexHomePath ? { homePath: settings.codexHomePath } : {}),
      },
    };
  }, [settings.codexBinaryPath, settings.codexHomePath]);
  const modelOptionsByProvider = useMemo(
    () => getCustomModelOptionsByProvider(settings),
    [settings],
  );
  const selectedModelForPickerWithCustomFallback = useMemo(() => {
    const currentOptions = modelOptionsByProvider[selectedProvider];
    return currentOptions.some((option) => option.slug === selectedModel)
      ? selectedModel
      : (normalizeModelSlug(selectedModel, selectedProvider) ?? selectedModel);
  }, [modelOptionsByProvider, selectedModel, selectedProvider]);
  const searchableModelOptions = useMemo(
    () =>
      AVAILABLE_PROVIDER_OPTIONS.filter(
        (option) => lockedProvider === null || option.value === lockedProvider,
      ).flatMap((option) =>
        modelOptionsByProvider[option.value].map(({ slug, name }) => ({
          name,
          provider: option.value,
          providerLabel: option.label,
          searchName: name.toLowerCase(),
          searchProvider: option.label.toLowerCase(),
          searchSlug: slug.toLowerCase(),
          slug,
        })),
      ),
    [lockedProvider, modelOptionsByProvider],
  );

  const draftInteractionMode =
    composerDraftSelection.interactionMode ?? activeThread.interactionMode ?? "default";
  const pendingState = useComposerPendingState({
    activeProposedPlan,
    activeThread,
    interactionMode: draftInteractionMode,
    latestTurnSettled,
    setThreadError,
  });
  const draftState = useComposerDraftState({
    activeThread,
    composerFooterHasWideActions:
      pendingState.showPlanFollowUpPrompt || pendingState.activePendingProgress !== null,
    isLocalDraftThread,
    setThreadError,
    stickToBottomIfNeeded,
    threadId,
  });
  const onSendRef = useRef<(() => Promise<void>) | null>(null);

  const onProviderModelSelect = useCallback(
    (provider: ProviderKind, model: ModelSlug) => {
      if (lockedProvider !== null && provider !== lockedProvider) {
        draftState.focus.scheduleComposerFocus();
        return;
      }
      setComposerDraftProvider(activeThread.id, provider);
      setComposerDraftModel(
        activeThread.id,
        resolveAppModelSelection(provider, settings.customCodexModels, model),
      );
      draftState.focus.scheduleComposerFocus();
    },
    [
      activeThread.id,
      draftState.focus,
      lockedProvider,
      setComposerDraftModel,
      setComposerDraftProvider,
      settings.customCodexModels,
    ],
  );
  const onEffortSelect = useCallback(
    (effort: CodexReasoningEffort) => {
      setComposerDraftEffort(threadId, effort);
      draftState.focus.scheduleComposerFocus();
    },
    [draftState.focus, setComposerDraftEffort, threadId],
  );
  const onCodexFastModeChange = useCallback(
    (enabled: boolean) => {
      setComposerDraftCodexFastMode(threadId, enabled);
      draftState.focus.scheduleComposerFocus();
    },
    [draftState.focus, setComposerDraftCodexFastMode, threadId],
  );

  const menuState = useComposerMenuState({
    activePendingProgress: pendingState.activePendingProgress,
    activePendingUserInputRequestId: pendingState.activePendingUserInput?.requestId ?? null,
    composerEditorRef: draftState.editorRefs.composerEditorRef,
    gitCwd,
    onSendRef,
    onToggleInteractionMode: draftState.controls.toggleInteractionMode,
    onUpdateInteractionMode: draftState.controls.handleInteractionModeChange,
    onUpdatePendingCustomAnswer: pendingState.setPendingCustomAnswer,
    onUpdateProviderModel: onProviderModelSelect,
    prompt: draftState.draft.prompt,
    promptRef: draftState.editorRefs.promptRef,
    resolvedTheme,
    searchableModelOptions,
    setPrompt: draftState.setPrompt,
    threadId,
  });

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      pendingState.onSelectActivePendingUserInputOption(questionId, optionLabel);
      draftState.editorRefs.promptRef.current = "";
      menuState.internalSetters.setComposerCursor(0);
      menuState.internalSetters.setComposerTrigger(null);
    },
    [draftState.editorRefs.promptRef, menuState.internalSetters, pendingState],
  );

  const sendActions = useComposerSendActions({
    activePendingApproval: pendingState.activePendingApproval,
    activePendingProgress: pendingState.activePendingProgress,
    activePendingUserInput: pendingState.activePendingUserInput,
    activeProject,
    activeProposedPlan,
    activeThread,
    addComposerImagesToDraft: draftState.stagedAttachments.addComposerImagesToDraft,
    clearComposerDraftContent: draftState.clearComposerDraftContent,
    composerImages: draftState.draft.images,
    composerImagesRef: draftState.editorRefs.composerImagesRef,
    envMode: draftState.draft.envMode,
    forceStickToBottom,
    handleInteractionModeChange: draftState.controls.handleInteractionModeChange,
    interactionMode: draftState.draft.interactionMode,
    isConnecting,
    isLocalDraftThread,
    isServerThread,
    markPlanSidebarOpenOnNextThread,
    onAdvanceActivePendingUserInput: pendingState.onAdvanceActivePendingUserInput,
    planSidebarDismissedForTurnRef,
    prompt: draftState.draft.prompt,
    promptRef: draftState.editorRefs.promptRef,
    providerOptionsForDispatch,
    runProjectScript,
    runtimeMode: draftState.draft.runtimeMode,
    selectedModel,
    selectedModelOptionsForDispatch,
    selectedProvider,
    sendPhase,
    serverThread,
    setComposerCursor: menuState.internalSetters.setComposerCursor,
    setComposerDraftInteractionMode,
    setComposerHighlightedItemId: menuState.internalSetters.setComposerHighlightedItemId,
    setComposerTrigger: menuState.internalSetters.setComposerTrigger,
    setOptimisticUserMessages,
    setPlanSidebarOpen,
    setPrompt: draftState.setPrompt,
    setSendPhase,
    setSendStartedAt,
    setStoreThreadBranch,
    setThreadError,
    settingsEnableAssistantStreaming: settings.enableAssistantStreaming,
    showPlanFollowUpPrompt: pendingState.showPlanFollowUpPrompt,
    syncServerReadModel,
    toggleResetDragState: draftState.resetDragState,
  });
  onSendRef.current = () => sendActions.actions.onSend();

  const placeholder = pendingState.isComposerApprovalState
    ? (pendingState.activePendingApproval?.detail ?? "Resolve this approval request to continue")
    : pendingState.activePendingProgress
      ? "Type your own answer, or leave this blank to use the selected option"
      : pendingState.showPlanFollowUpPrompt && activeProposedPlan
        ? "Add feedback to refine the plan, or leave this blank to implement it"
        : sendActions.actions.phase === "disconnected"
          ? "Ask for follow-up changes or attach images"
          : "Ask anything, @tag files/folders, or use / to show available commands";
  const nonPersistedComposerImageIdSet = useMemo(
    () => new Set(draftState.draft.nonPersistedImageIds),
    [draftState.draft.nonPersistedImageIds],
  );

  return {
    actions: {
      ...sendActions.actions,
      isConnecting,
    },
    attachments: {
      images: draftState.draft.images,
      isDragOverComposer: draftState.attachments.isDragOverComposer,
      nonPersistedImageIdSet: nonPersistedComposerImageIdSet,
      onDragEnter: draftState.attachments.onComposerDragEnter,
      onDragLeave: draftState.attachments.onComposerDragLeave,
      onDragOver: draftState.attachments.onComposerDragOver,
      onDrop: draftState.attachments.onComposerDrop,
      onPreviewImage: (imageId: string) => {
        const preview = buildExpandedImagePreview(draftState.draft.images, imageId);
        if (!preview) return;
        setExpandedImage(preview);
      },
      onRemoveImage: draftState.attachments.removeComposerImage,
      resetDragState: draftState.resetDragState,
    },
    banner: {
      activePendingApproval: pendingState.activePendingApproval,
      activePendingDraftAnswers: pendingState.activePendingDraftAnswers,
      activePendingIsResponding: pendingState.activePendingIsResponding,
      activePendingProgress: pendingState.activePendingProgress,
      activePendingQuestionIndex: pendingState.activePendingQuestionIndex,
      activePendingResolvedAnswers: pendingState.activePendingResolvedAnswers,
      activeProposedPlan,
      onAdvanceActivePendingUserInput: pendingState.onAdvanceActivePendingUserInput,
      onPreviousActivePendingUserInputQuestion:
        pendingState.onPreviousActivePendingUserInputQuestion,
      onRespondToApproval: pendingState.onRespondToApproval,
      onSelectActivePendingUserInputOption,
      pendingApprovals: pendingState.pendingApprovals,
      pendingUserInputs: pendingState.pendingUserInputs,
      respondingRequestIds: pendingState.respondingRequestIds,
      respondingUserInputRequestIds: pendingState.respondingUserInputRequestIds,
      showPlanFollowUpPrompt: pendingState.showPlanFollowUpPrompt,
    },
    controls: {
      activePlan,
      activeProposedPlan,
      interactionMode: draftState.draft.interactionMode,
      isComposerFooterCompact: draftState.layout.isComposerFooterCompact,
      lockedProvider,
      modelOptionsByProvider,
      onCodexFastModeChange,
      onEffortSelect,
      onProviderModelSelect,
      planSidebarOpen,
      reasoningOptions,
      runtimeMode: draftState.draft.runtimeMode,
      selectedCodexFastModeEnabled,
      selectedEffort,
      selectedModelForPickerWithCustomFallback,
      selectedProvider,
      toggleInteractionMode: draftState.controls.toggleInteractionMode,
      togglePlanSidebar,
      toggleRuntimeMode: draftState.controls.toggleRuntimeMode,
    },
    editor: {
      composerCursor: menuState.editorState.composerCursor,
      composerEditorRef: draftState.editorRefs.composerEditorRef,
      composerFormRef: draftState.editorRefs.composerFormRef,
      disabled: isConnecting || pendingState.isComposerApprovalState,
      hasComposerHeader: pendingState.hasComposerHeader,
      isComposerApprovalState: pendingState.isComposerApprovalState,
      onCommandKey: menuState.editorState.onComposerCommandKey,
      onPaste: draftState.attachments.onComposerPaste,
      onPromptChange: menuState.editorState.onPromptChange,
      placeholder,
      prompt: draftState.draft.prompt,
      showAttachmentTray:
        !pendingState.isComposerApprovalState && pendingState.pendingUserInputs.length === 0,
      value: pendingState.isComposerApprovalState
        ? ""
        : pendingState.activePendingProgress
          ? pendingState.activePendingProgress.customAnswer
          : draftState.draft.prompt,
    },
    focus: {
      focusComposer: draftState.focus.focusComposer,
      scheduleComposerFocus: draftState.focus.scheduleComposerFocus,
    },
    menu: {
      ...menuState.menuState,
    },
    thread: {
      envLocked: draftState.draft.envLocked,
      envMode: draftState.draft.envMode,
      onEnvModeChange: draftState.controls.onEnvModeChange,
    },
  };
}

export type ChatComposerController = ReturnType<typeof useChatComposerController>;
export type ChatComposerActionsSection = ChatComposerController["actions"];
export type ChatComposerAttachmentsSection = ChatComposerController["attachments"];
export type ChatComposerBannerSection = ChatComposerController["banner"];
export type ChatComposerControlsSection = ChatComposerController["controls"];
export type ChatComposerEditorSection = ChatComposerController["editor"];
export type ChatComposerFocusSection = ChatComposerController["focus"];
export type ChatComposerMenuSection = ChatComposerController["menu"];
export type ChatComposerThreadSection = ChatComposerController["thread"];
