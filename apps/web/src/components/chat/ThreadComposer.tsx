import {
  type ApprovalRequestId,
  type CodexReasoningEffort,
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSlug,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ProjectScript,
  type ProviderApprovalDecision,
  type ProviderKind,
  ProviderInteractionMode,
  RuntimeMode,
  type ProjectEntry,
  type ThreadId,
} from "@t3tools/contracts";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  normalizeModelSlug,
  resolveModelSlugForProvider,
} from "@t3tools/shared/model";
import {
  BotIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ListTodoIcon,
  LockIcon,
  LockOpenIcon,
  XIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import { cn, randomUUID } from "~/lib/utils";
import {
  clampCollapsedComposerCursor,
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  parseStandaloneComposerSlashCommand,
  replaceTextRange,
  type ComposerTrigger,
} from "../../composer-logic";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import {
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
} from "../../proposedPlan";
import {
  deriveActivePlanState,
  derivePendingApprovals,
  derivePendingUserInputs,
  findLatestProposedPlan,
  isLatestTurnSettled,
  type ActivePlanState,
  type LatestProposedPlanState,
} from "../../session-logic";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ChatMessage,
  type Project,
  type SessionPhase,
  type Thread,
} from "../../types";
import { basenameOfPath } from "../../vscode-icons";
import {
  type ComposerImageAttachment,
  type DraftThreadEnvMode,
  type PersistedComposerImageAttachment,
  useComposerDraftStore,
  useComposerThreadDraft,
} from "../../composerDraftStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";
import { CodexTraitsPicker } from "./CodexTraitsPicker";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { ComposerCommandItem, ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import { AVAILABLE_PROVIDER_OPTIONS, ProviderModelPicker } from "./ProviderModelPicker";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { setupProjectScript } from "~/projectScripts";
import { resolveAppModelSelection, useAppSettings } from "../../appSettings";
import {
  buildTemporaryWorktreeBranchName,
  cloneComposerImageForRetry,
  getCustomModelOptionsByProvider,
  readFileAsDataUrl,
  revokeUserMessagePreviewUrls,
  type SendPhase,
} from "../ChatView.logic";
import { truncateTitle } from "../../truncateTitle";
import { toastManager } from "../ui/toast";
import { useTheme } from "../../hooks/useTheme";
import { useStore } from "../../store";

const EMPTY_PROJECT_ENTRIES: ProjectEntry[] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};
const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;
const IMAGE_SIZE_LIMIT_LABEL = `${Math.round(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;
const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

interface ComposerSearchableModelOption {
  provider: ProviderKind;
  providerLabel: string;
  slug: ModelSlug;
  name: string;
  searchSlug: string;
  searchName: string;
  searchProvider: string;
}

export interface ThreadComposerProps {
  activeProject: Project | null;
  activeThread: Thread;
  assistantStreamingEnabled: boolean;
  composerEditorRef: RefObject<ComposerPromptEditorHandle | null>;
  composerFormRef: RefObject<HTMLFormElement | null>;
  gitCwd: string | null;
  isComposerFooterCompact: boolean;
  isConnecting: boolean;
  isGitRepo: boolean;
  isServerThread: boolean;
  isPreparingWorktree: boolean;
  isSendBusy: boolean;
  beginSendPhase: (nextPhase: Exclude<SendPhase, "idle">) => void;
  createWorktree: (input: {
    cwd: string;
    branch: string;
    newBranch: string;
  }) => Promise<{ worktree: { branch: string; path: string } }>;
  envMode: DraftThreadEnvMode;
  focusComposer: () => void;
  forceStickToBottom: () => void;
  onOpenPlanSidebarForExecution: () => void;
  onOpenPlanSidebarForNextThread: () => void;
  persistThreadSettingsForNextTurn: (input: {
    threadId: ThreadId;
    createdAt: string;
    model?: string;
    runtimeMode: RuntimeMode;
    interactionMode: ProviderInteractionMode;
  }) => Promise<void>;
  phase: SessionPhase;
  planSidebarOpen: boolean;
  resetSendPhase: () => void;
  runProjectScript: (
    script: ProjectScript,
    options?: {
      cwd?: string;
      worktreePath?: string | null;
      rememberAsLastInvoked?: boolean;
      allowLocalDraftThread?: boolean;
    },
  ) => Promise<void>;
  sendInFlightRef: RefObject<boolean>;
  setExpandedImage: Dispatch<SetStateAction<ExpandedImagePreview | null>>;
  setOptimisticUserMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStoreThreadBranch: (
    threadId: ThreadId,
    branch: string | null,
    worktreePath: string | null,
  ) => void;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  togglePlanSidebar: () => void;
}

export default function ThreadComposer({
  activeProject,
  activeThread,
  assistantStreamingEnabled,
  composerEditorRef,
  composerFormRef,
  gitCwd,
  isComposerFooterCompact,
  isConnecting,
  isGitRepo,
  isServerThread,
  isPreparingWorktree,
  isSendBusy,
  beginSendPhase,
  createWorktree,
  envMode,
  focusComposer,
  forceStickToBottom,
  onOpenPlanSidebarForExecution,
  onOpenPlanSidebarForNextThread,
  persistThreadSettingsForNextTurn,
  phase,
  planSidebarOpen,
  resetSendPhase,
  runProjectScript,
  sendInFlightRef,
  setExpandedImage,
  setOptimisticUserMessages,
  setStoreThreadBranch,
  setThreadError,
  togglePlanSidebar,
}: ThreadComposerProps) {
  const navigate = useNavigate();
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const { resolvedTheme } = useTheme();
  const composerDraft = useComposerThreadDraft(activeThread.id);
  const prompt = composerDraft.prompt;
  const composerImages = composerDraft.images;
  const nonPersistedComposerImageIdSet = useMemo(
    () => new Set(composerDraft.nonPersistedImageIds),
    [composerDraft.nonPersistedImageIds],
  );
  const promptRef = useRef(prompt);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  const [composerCursor, setComposerCursor] = useState(() =>
    collapseExpandedComposerCursor(prompt, prompt.length),
  );
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(() =>
    detectComposerTrigger(prompt, prompt.length),
  );
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [respondingApprovalRequestIds, setRespondingApprovalRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerSelectLockRef = useRef(false);
  const dragDepthRef = useRef(0);
  const lastSyncedPendingInputRef = useRef<{
    requestId: string | null;
    questionId: string | null;
  } | null>(null);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const { settings } = useAppSettings();
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImage = useComposerDraftStore((store) => store.addImage);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const setComposerDraftProvider = useComposerDraftStore((store) => store.setProvider);
  const setComposerDraftModel = useComposerDraftStore((store) => store.setModel);
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const setComposerDraftEffort = useComposerDraftStore((store) => store.setEffort);
  const setComposerDraftCodexFastMode = useComposerDraftStore((store) => store.setCodexFastMode);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const runtimeMode = composerDraft.runtimeMode ?? activeThread.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const interactionMode =
    composerDraft.interactionMode ?? activeThread.interactionMode ?? DEFAULT_INTERACTION_MODE;
  const activeLatestTurn = activeThread.latestTurn ?? null;
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread.session ?? null);
  const threadActivities = activeThread.activities;
  const pendingApprovals = useMemo(
    () => derivePendingApprovals(threadActivities ?? []),
    [threadActivities],
  );
  const pendingUserInputs = useMemo(
    () => derivePendingUserInputs(threadActivities ?? []),
    [threadActivities],
  );
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activeProposedPlan = useMemo<LatestProposedPlanState | null>(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread.proposedPlans, latestTurnSettled]);
  const activePlan = useMemo<ActivePlanState | null>(
    () => deriveActivePlanState(threadActivities ?? [], activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const showPlanFollowUpPrompt =
    pendingUserInputs.length === 0 &&
    interactionMode === "plan" &&
    latestTurnSettled &&
    activeProposedPlan !== null;
  const sessionProvider = activeThread.session?.provider ?? null;
  const selectedProviderByThreadId = composerDraft.provider;
  const hasThreadStarted =
    activeThread.latestTurn !== null ||
    activeThread.messages.length > 0 ||
    activeThread.session !== null;
  const lockedProvider: ProviderKind | null = hasThreadStarted
    ? (sessionProvider ?? selectedProviderByThreadId ?? null)
    : null;
  const selectedProvider: ProviderKind = lockedProvider ?? selectedProviderByThreadId ?? "codex";
  const baseThreadModel = resolveModelSlugForProvider(
    selectedProvider,
    activeThread.model ?? activeProject?.model ?? getDefaultModel(selectedProvider),
  );
  const customModelsForSelectedProvider = settings.customCodexModels;
  const selectedModel = useMemo(() => {
    const draftModel = composerDraft.model;
    if (!draftModel) {
      return baseThreadModel;
    }
    return resolveAppModelSelection(
      selectedProvider,
      customModelsForSelectedProvider,
      draftModel,
    ) as ModelSlug;
  }, [baseThreadModel, composerDraft.model, customModelsForSelectedProvider, selectedProvider]);
  const reasoningOptions = getReasoningEffortOptions(selectedProvider);
  const supportsReasoningEffort = reasoningOptions.length > 0;
  const selectedEffort = composerDraft.effort ?? getDefaultReasoningEffort(selectedProvider);
  const selectedCodexFastModeEnabled =
    selectedProvider === "codex" ? composerDraft.codexFastMode : false;
  const selectedModelOptionsForDispatch = useMemo<
    | {
        codex?: {
          reasoningEffort?: CodexReasoningEffort;
          fastMode?: true;
        };
      }
    | undefined
  >(() => {
    if (selectedProvider !== "codex") {
      return undefined;
    }
    const codexOptions: {
      reasoningEffort?: CodexReasoningEffort;
      fastMode?: true;
    } = {
      ...(supportsReasoningEffort && selectedEffort ? { reasoningEffort: selectedEffort } : {}),
      ...(selectedCodexFastModeEnabled ? { fastMode: true as const } : {}),
    };
    return Object.keys(codexOptions).length > 0 ? { codex: codexOptions } : undefined;
  }, [selectedCodexFastModeEnabled, selectedEffort, selectedProvider, supportsReasoningEffort]);
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
  const searchableModelOptions = useMemo<ComposerSearchableModelOption[]>(
    () =>
      AVAILABLE_PROVIDER_OPTIONS.filter(
        (option) => lockedProvider === null || option.value === lockedProvider,
      ).flatMap((option) =>
        modelOptionsByProvider[option.value].map(({ slug, name }) => ({
          provider: option.value,
          providerLabel: option.label,
          slug,
          name,
          searchSlug: slug.toLowerCase(),
          searchName: name.toLowerCase(),
          searchProvider: option.label.toLowerCase(),
        })),
      ),
    [lockedProvider, modelOptionsByProvider],
  );
  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(activeThread.id, nextPrompt);
    },
    [activeThread.id, setComposerDraftPrompt],
  );
  const addComposerImage = useCallback(
    (image: ComposerImageAttachment) => {
      addComposerDraftImage(activeThread.id, image);
    },
    [activeThread.id, addComposerDraftImage],
  );
  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => {
      addComposerDraftImages(activeThread.id, images);
    },
    [activeThread.id, addComposerDraftImages],
  );
  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      removeComposerDraftImage(activeThread.id, imageId);
    },
    [activeThread.id, removeComposerDraftImage],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputAnswersByRequestId[activePendingUserInput.requestId] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  const isComposerApprovalState = activePendingApproval !== null;
  const hasComposerHeader =
    isComposerApprovalState ||
    pendingUserInputs.length > 0 ||
    (showPlanFollowUpPrompt && activeProposedPlan !== null);
  const composerDisabled = isConnecting || isComposerApprovalState;
  const composerPlaceholder = isComposerApprovalState
    ? (activePendingApproval?.detail ?? "Resolve this approval request to continue")
    : activePendingProgress
      ? "Type your own answer, or leave this blank to use the selected option"
      : showPlanFollowUpPrompt && activeProposedPlan
        ? "Add feedback to refine the plan, or leave this blank to implement it"
        : phase === "disconnected"
          ? "Ask for follow-up changes or attach images"
          : "Ask anything, @tag files/folders, or use / to show available commands";
  const composerValue = isComposerApprovalState
    ? ""
    : activePendingProgress
      ? activePendingProgress.customAnswer
      : prompt;
  const composerTriggerKind = composerTrigger?.kind ?? null;
  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const isPathTrigger = composerTriggerKind === "path";
  const [debouncedPathQuery, composerPathQueryDebouncer] = useDebouncedValue(
    pathTriggerQuery,
    { wait: COMPOSER_PATH_QUERY_DEBOUNCE_MS },
    (debouncerState) => ({ isPending: debouncerState.isPending }),
  );
  const effectivePathQuery = pathTriggerQuery.length > 0 ? debouncedPathQuery : "";
  const workspaceEntriesQuery = useQuery(
    projectSearchEntriesQueryOptions({
      cwd: gitCwd,
      query: effectivePathQuery,
      enabled: isPathTrigger,
      limit: 80,
    }),
  );
  const workspaceEntries = workspaceEntriesQuery.data?.entries ?? EMPTY_PROJECT_ENTRIES;
  const composerMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      return workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path",
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
    }

    if (composerTrigger.kind === "slash-command") {
      const slashCommandItems = [
        {
          id: "slash:model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Switch response model for this thread",
        },
        {
          id: "slash:plan",
          type: "slash-command",
          command: "plan",
          label: "/plan",
          description: "Switch this thread into plan mode",
        },
        {
          id: "slash:default",
          type: "slash-command",
          command: "default",
          label: "/default",
          description: "Switch this thread back to normal chat mode",
        },
      ] satisfies ReadonlyArray<Extract<ComposerCommandItem, { type: "slash-command" }>>;
      const query = composerTrigger.query.trim().toLowerCase();
      if (!query) {
        return [...slashCommandItems];
      }
      return slashCommandItems.filter(
        (item) => item.command.includes(query) || item.label.slice(1).includes(query),
      );
    }

    return searchableModelOptions
      .filter(({ searchSlug, searchName, searchProvider }) => {
        const query = composerTrigger.query.trim().toLowerCase();
        if (!query) return true;
        return (
          searchSlug.includes(query) || searchName.includes(query) || searchProvider.includes(query)
        );
      })
      .map(({ provider, providerLabel, slug, name }) => ({
        id: `model:${provider}:${slug}`,
        type: "model",
        provider,
        model: slug,
        label: name,
        description: `${providerLabel} · ${slug}`,
      }));
  }, [composerTrigger, searchableModelOptions, workspaceEntries]);
  const composerMenuOpen = Boolean(composerTrigger);
  const activeComposerMenuItem = useMemo(
    () =>
      composerMenuItems.find((item) => item.id === composerHighlightedItemId) ??
      composerMenuItems[0] ??
      null,
    [composerHighlightedItemId, composerMenuItems],
  );
  composerMenuOpenRef.current = composerMenuOpen;
  composerMenuItemsRef.current = composerMenuItems;
  activeComposerMenuItemRef.current = activeComposerMenuItem;
  const isComposerMenuLoading =
    composerTriggerKind === "path" &&
    ((pathTriggerQuery.length > 0 && composerPathQueryDebouncer.state.isPending) ||
      workspaceEntriesQuery.isLoading ||
      workspaceEntriesQuery.isFetching);

  useEffect(() => {
    dragDepthRef.current = 0;
    setIsDragOverComposer(false);
  }, [activeThread.id]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);

  useEffect(() => {
    promptRef.current = prompt;
    setComposerCursor((existing) => clampCollapsedComposerCursor(prompt, existing));
  }, [prompt]);

  useEffect(() => {
    setComposerHighlightedItemId(null);
    setComposerCursor(collapseExpandedComposerCursor(promptRef.current, promptRef.current.length));
    setComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
  }, [activeThread.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (composerImages.length === 0) {
        clearComposerDraftPersistedAttachments(activeThread.id);
        return;
      }
      const getPersistedAttachmentsForThread = () =>
        useComposerDraftStore.getState().draftsByThreadId[activeThread.id]?.persistedAttachments ??
        [];
      try {
        const currentPersistedAttachments = getPersistedAttachmentsForThread();
        const existingPersistedById = new Map(
          currentPersistedAttachments.map((attachment) => [attachment.id, attachment]),
        );
        const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
        await Promise.all(
          composerImages.map(async (image) => {
            try {
              const dataUrl = await readFileAsDataUrl(image.file);
              stagedAttachmentById.set(image.id, {
                id: image.id,
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                dataUrl,
              });
            } catch {
              const existingPersisted = existingPersistedById.get(image.id);
              if (existingPersisted) {
                stagedAttachmentById.set(image.id, existingPersisted);
              }
            }
          }),
        );
        if (cancelled) {
          return;
        }
        syncComposerDraftPersistedAttachments(
          activeThread.id,
          Array.from(stagedAttachmentById.values()),
        );
      } catch {
        const currentImageIds = new Set(composerImages.map((image) => image.id));
        const fallbackPersistedAttachments = getPersistedAttachmentsForThread();
        const fallbackPersistedIds = fallbackPersistedAttachments
          .map((attachment) => attachment.id)
          .filter((id) => currentImageIds.has(id));
        const fallbackPersistedIdSet = new Set(fallbackPersistedIds);
        const fallbackAttachments = fallbackPersistedAttachments.filter((attachment) =>
          fallbackPersistedIdSet.has(attachment.id),
        );
        if (cancelled) {
          return;
        }
        syncComposerDraftPersistedAttachments(activeThread.id, fallbackAttachments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeThread.id,
    clearComposerDraftPersistedAttachments,
    composerImages,
    syncComposerDraftPersistedAttachments,
  ]);

  useEffect(() => {
    const nextCustomAnswer = activePendingProgress?.customAnswer;
    if (typeof nextCustomAnswer !== "string") {
      lastSyncedPendingInputRef.current = null;
      return;
    }
    const nextRequestId = activePendingUserInput?.requestId ?? null;
    const nextQuestionId = activePendingProgress?.activeQuestion?.id ?? null;
    const questionChanged =
      lastSyncedPendingInputRef.current?.requestId !== nextRequestId ||
      lastSyncedPendingInputRef.current?.questionId !== nextQuestionId;
    const textChangedExternally = promptRef.current !== nextCustomAnswer;

    lastSyncedPendingInputRef.current = {
      requestId: nextRequestId,
      questionId: nextQuestionId,
    };

    if (!questionChanged && !textChangedExternally) {
      return;
    }

    promptRef.current = nextCustomAnswer;
    const nextCursor = collapseExpandedComposerCursor(nextCustomAnswer, nextCustomAnswer.length);
    setComposerCursor(nextCursor);
    setComposerTrigger(
      detectComposerTrigger(
        nextCustomAnswer,
        expandCollapsedComposerCursor(nextCustomAnswer, nextCursor),
      ),
    );
    setComposerHighlightedItemId(null);
  }, [
    activePendingProgress?.activeQuestion?.id,
    activePendingProgress?.customAnswer,
    activePendingUserInput?.requestId,
    promptRef,
    setComposerCursor,
    setComposerHighlightedItemId,
    setComposerTrigger,
  ]);

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInput) {
        return;
      }
      promptRef.current = value;
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: setPendingUserInputCustomAnswer(
            existing[activePendingUserInput.requestId]?.[questionId],
            value,
          ),
        },
      }));
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(value, expandedCursor),
      );
    },
    [activePendingUserInput, promptRef, setComposerCursor, setComposerTrigger],
  );

  const setActivePendingUserInputQuestionIndex = useCallback(
    (nextQuestionIndex: number) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: nextQuestionIndex,
      }));
    },
    [activePendingUserInput],
  );

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: {
            selectedOptionLabel: optionLabel,
            customAnswer: "",
          },
        },
      }));
      promptRef.current = "";
      setComposerCursor(0);
      setComposerTrigger(null);
    },
    [activePendingUserInput, promptRef, setComposerCursor, setComposerTrigger],
  );

  const onAdvanceActivePendingUserInput = useCallback(async () => {
    if (!activePendingUserInput || !activePendingProgress) {
      return;
    }
    if (activePendingProgress.isLastQuestion) {
      if (!activePendingResolvedAnswers) {
        return;
      }
      const requestId = activePendingUserInput.requestId;
      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      try {
        const api = readNativeApi();
        if (api) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.user-input.respond",
              commandId: newCommandId(),
              threadId: activeThread.id,
              requestId,
              answers: activePendingResolvedAnswers,
              createdAt: new Date().toISOString(),
            })
            .catch((err: unknown) => {
              setThreadError(
                activeThread.id,
                err instanceof Error ? err.message : "Failed to submit user input.",
              );
            });
        }
      } finally {
        setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
      }
      return;
    }
    setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
  }, [
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingUserInput,
    activeThread.id,
    setThreadError,
    setActivePendingUserInputQuestionIndex,
  ]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingProgress) {
      return;
    }
    setActivePendingUserInputQuestionIndex(Math.max(activePendingProgress.questionIndex - 1, 0));
  }, [activePendingProgress, setActivePendingUserInputQuestionIndex]);

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      const api = readNativeApi();
      if (!api) return;
      await api.orchestration
        .dispatchCommand({
          type: "thread.approval.respond",
          commandId: newCommandId(),
          threadId: activeThread.id,
          requestId,
          decision,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setThreadError(
            activeThread.id,
            err instanceof Error ? err.message : "Failed to submit approval decision.",
          );
        });
    },
    [activeThread.id, setThreadError],
  );

  const onInterrupt = useCallback(async () => {
    const api = readNativeApi();
    if (!api) return;
    await api.orchestration.dispatchCommand({
      type: "thread.turn.interrupt",
      commandId: newCommandId(),
      threadId: activeThread.id,
      createdAt: new Date().toISOString(),
    });
  }, [activeThread.id]);

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
        type: "thread.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        model: nextThreadModel,
        runtimeMode,
        interactionMode: "default",
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      })
      .then(() =>
        api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: implementationPrompt,
            attachments: [],
          },
          provider: selectedProvider,
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch
            ? { modelOptions: selectedModelOptionsForDispatch }
            : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode: assistantStreamingEnabled ? "streaming" : "buffered",
          runtimeMode,
          interactionMode: "default",
          createdAt,
        }),
      )
      .then(() => api.orchestration.getSnapshot())
      .then((snapshot) => {
        syncServerReadModel(snapshot);
        onOpenPlanSidebarForNextThread();
        return navigate({
          to: "/$threadId",
          params: { threadId: nextThreadId },
        });
      })
      .catch(async (err) => {
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: nextThreadId,
          })
          .catch(() => undefined);
        await api.orchestration
          .getSnapshot()
          .then((snapshot) => {
            syncServerReadModel(snapshot);
          })
          .catch(() => undefined);
        toastManager.add({
          type: "error",
          title: "Could not start implementation thread",
          description:
            err instanceof Error ? err.message : "An error occurred while creating the new thread.",
        });
      })
      .then(finish, finish);
  }, [
    activeProject,
    activeProposedPlan,
    activeThread,
    assistantStreamingEnabled,
    beginSendPhase,
    isConnecting,
    isSendBusy,
    isServerThread,
    navigate,
    onOpenPlanSidebarForNextThread,
    providerOptionsForDispatch,
    resetSendPhase,
    runtimeMode,
    selectedModel,
    selectedModelOptionsForDispatch,
    selectedProvider,
    sendInFlightRef,
    syncServerReadModel,
  ]);

  const handleRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      setRespondingApprovalRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      try {
        await onRespondToApproval(requestId, decision);
      } finally {
        setRespondingApprovalRequestIds((existing) => existing.filter((id) => id !== requestId));
      }
    },
    [onRespondToApproval],
  );

  const isLocalDraftThread = !isServerThread;
  const handleRuntimeModeChange = useCallback(
    (mode: RuntimeMode) => {
      if (mode === runtimeMode) return;
      setComposerDraftRuntimeMode(activeThread.id, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(activeThread.id, { runtimeMode: mode });
      }
      focusComposer();
    },
    [
      activeThread.id,
      focusComposer,
      isLocalDraftThread,
      runtimeMode,
      setComposerDraftRuntimeMode,
      setDraftThreadContext,
    ],
  );
  const handleInteractionModeChange = useCallback(
    (mode: ProviderInteractionMode) => {
      if (mode === interactionMode) return;
      setComposerDraftInteractionMode(activeThread.id, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(activeThread.id, { interactionMode: mode });
      }
      focusComposer();
    },
    [
      activeThread.id,
      focusComposer,
      interactionMode,
      isLocalDraftThread,
      setComposerDraftInteractionMode,
      setDraftThreadContext,
    ],
  );
  const toggleInteractionMode = useCallback(() => {
    handleInteractionModeChange(interactionMode === "plan" ? "default" : "plan");
  }, [handleInteractionModeChange, interactionMode]);
  const toggleRuntimeMode = useCallback(() => {
    void handleRuntimeModeChange(
      runtimeMode === "full-access" ? "approval-required" : "full-access",
    );
  }, [handleRuntimeModeChange, runtimeMode]);
  const onProviderModelSelect = useCallback<
    ComponentProps<typeof ProviderModelPicker>["onProviderModelChange"]
  >(
    (provider, model) => {
      if (lockedProvider !== null && provider !== lockedProvider) {
        focusComposer();
        return;
      }
      setComposerDraftProvider(activeThread.id, provider);
      setComposerDraftModel(
        activeThread.id,
        resolveAppModelSelection(provider, settings.customCodexModels, model),
      );
      focusComposer();
    },
    [
      activeThread.id,
      focusComposer,
      lockedProvider,
      setComposerDraftModel,
      setComposerDraftProvider,
      settings.customCodexModels,
    ],
  );
  const onEffortSelect = useCallback(
    (effort: CodexReasoningEffort) => {
      setComposerDraftEffort(activeThread.id, effort);
      focusComposer();
    },
    [activeThread.id, focusComposer, setComposerDraftEffort],
  );
  const onCodexFastModeChange = useCallback(
    (enabled: boolean) => {
      setComposerDraftCodexFastMode(activeThread.id, enabled);
      focusComposer();
    },
    [activeThread.id, focusComposer, setComposerDraftCodexFastMode],
  );

  const onSubmitPlanFollowUp = useCallback(
    async ({
      text,
      interactionMode: nextInteractionMode,
    }: {
      text: string;
      interactionMode: "default" | "plan";
    }) => {
      const api = readNativeApi();
      if (!api || !isServerThread || isSendBusy || isConnecting || sendInFlightRef.current) {
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
          id: messageIdForSend,
          role: "user",
          text: trimmed,
          createdAt: messageCreatedAt,
          streaming: false,
        },
      ]);
      forceStickToBottom();

      try {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          ...(selectedModel ? { model: selectedModel } : {}),
          runtimeMode,
          interactionMode: nextInteractionMode,
        });

        setComposerDraftInteractionMode(threadIdForSend, nextInteractionMode);

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: trimmed,
            attachments: [],
          },
          provider: selectedProvider,
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch
            ? { modelOptions: selectedModelOptionsForDispatch }
            : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode: assistantStreamingEnabled ? "streaming" : "buffered",
          runtimeMode,
          interactionMode: nextInteractionMode,
          createdAt: messageCreatedAt,
        });
        if (nextInteractionMode === "default") {
          onOpenPlanSidebarForExecution();
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
      assistantStreamingEnabled,
      beginSendPhase,
      forceStickToBottom,
      isConnecting,
      isSendBusy,
      isServerThread,
      onOpenPlanSidebarForExecution,
      persistThreadSettingsForNextTurn,
      providerOptionsForDispatch,
      resetSendPhase,
      runtimeMode,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedProvider,
      sendInFlightRef,
      setComposerDraftInteractionMode,
      setOptimisticUserMessages,
      setThreadError,
    ],
  );

  const handleSubmit = useCallback(
    async (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      if (activePendingProgress) {
        await onAdvanceActivePendingUserInput();
        return;
      }

      const api = readNativeApi();
      if (!api || isSendBusy || isConnecting || sendInFlightRef.current) return;

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
          text: followUp.text,
          interactionMode: followUp.interactionMode,
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
      const isFirstMessage = isLocalDraftThread || activeThread.messages.length === 0;
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
          type: "image" as const,
          name: image.name,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          dataUrl: await readFileAsDataUrl(image.file),
        })),
      );
      const optimisticAttachments = composerImagesSnapshot.map((image) => ({
        type: "image" as const,
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        previewUrl: image.previewUrl,
      }));
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: messageIdForSend,
          role: "user",
          text: trimmed,
          ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
          createdAt: messageCreatedAt,
          streaming: false,
        },
      ]);
      forceStickToBottom();

      setThreadError(threadIdForSend, null);
      promptRef.current = "";
      clearComposerDraftContent(threadIdForSend);
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);

      let createdServerThreadForLocalDraft = false;
      let turnStartSucceeded = false;
      let nextThreadBranch = activeThread.branch;
      let nextThreadWorktreePath = activeThread.worktreePath;
      await (async () => {
        if (baseBranchForWorktree) {
          beginSendPhase("preparing-worktree");
          const result = await createWorktree({
            cwd: activeProject.cwd,
            branch: baseBranchForWorktree,
            newBranch: buildTemporaryWorktreeBranchName(),
          });
          nextThreadBranch = result.worktree.branch;
          nextThreadWorktreePath = result.worktree.path;
          if (isServerThread) {
            await api.orchestration.dispatchCommand({
              type: "thread.meta.update",
              commandId: newCommandId(),
              threadId: threadIdForSend,
              branch: result.worktree.branch,
              worktreePath: result.worktree.path,
            });
            setStoreThreadBranch(threadIdForSend, result.worktree.branch, result.worktree.path);
          }
        }

        let titleSeed = trimmed;
        if (!titleSeed) {
          const firstComposerImageName = composerImagesSnapshot[0]?.name ?? null;
          titleSeed = firstComposerImageName ? `Image: ${firstComposerImageName}` : "New thread";
        }
        const title = truncateTitle(titleSeed);
        const threadCreateModel: ModelSlug =
          selectedModel || (activeProject.model as ModelSlug) || DEFAULT_MODEL_BY_PROVIDER.codex;

        if (isLocalDraftThread) {
          await api.orchestration.dispatchCommand({
            type: "thread.create",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            projectId: activeProject.id,
            title,
            model: threadCreateModel,
            runtimeMode,
            interactionMode,
            branch: nextThreadBranch,
            worktreePath: nextThreadWorktreePath,
            createdAt: activeThread.createdAt,
          });
          createdServerThreadForLocalDraft = true;
        }

        const setupScript = baseBranchForWorktree
          ? setupProjectScript(activeProject.scripts)
          : null;
        if (setupScript) {
          const shouldRunSetupScript = isServerThread || createdServerThreadForLocalDraft;
          if (shouldRunSetupScript) {
            const setupScriptOptions: Parameters<typeof runProjectScript>[1] = {
              worktreePath: nextThreadWorktreePath,
              rememberAsLastInvoked: false,
              allowLocalDraftThread: createdServerThreadForLocalDraft,
            };
            if (nextThreadWorktreePath) {
              setupScriptOptions.cwd = nextThreadWorktreePath;
            }
            await runProjectScript(setupScript, setupScriptOptions);
          }
        }

        if (isFirstMessage && isServerThread) {
          await api.orchestration.dispatchCommand({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            title,
          });
        }

        if (isServerThread) {
          await persistThreadSettingsForNextTurn({
            threadId: threadIdForSend,
            createdAt: messageCreatedAt,
            ...(selectedModel ? { model: selectedModel } : {}),
            runtimeMode,
            interactionMode,
          });
        }

        beginSendPhase("sending-turn");
        const turnAttachments = await turnAttachmentsPromise;
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: trimmed || IMAGE_ONLY_BOOTSTRAP_PROMPT,
            attachments: turnAttachments,
          },
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch
            ? { modelOptions: selectedModelOptionsForDispatch }
            : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          provider: selectedProvider,
          assistantDeliveryMode: assistantStreamingEnabled ? "streaming" : "buffered",
          runtimeMode,
          interactionMode,
          createdAt: messageCreatedAt,
        });
        turnStartSucceeded = true;
      })().catch(async (err: unknown) => {
        if (createdServerThreadForLocalDraft && !turnStartSucceeded) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.delete",
              commandId: newCommandId(),
              threadId: threadIdForSend,
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
          setComposerCursor(collapseExpandedComposerCursor(trimmed, trimmed.length));
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
      assistantStreamingEnabled,
      beginSendPhase,
      clearComposerDraftContent,
      composerImages,
      createWorktree,
      envMode,
      forceStickToBottom,
      interactionMode,
      isConnecting,
      isLocalDraftThread,
      isSendBusy,
      isServerThread,
      onAdvanceActivePendingUserInput,
      handleInteractionModeChange,
      onSubmitPlanFollowUp,
      persistThreadSettingsForNextTurn,
      prompt,
      promptRef,
      providerOptionsForDispatch,
      resetSendPhase,
      runtimeMode,
      runProjectScript,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedProvider,
      sendInFlightRef,
      setComposerCursor,
      setComposerHighlightedItemId,
      setComposerTrigger,
      setOptimisticUserMessages,
      setPrompt,
      setStoreThreadBranch,
      setThreadError,
      showPlanFollowUpPrompt,
    ],
  );

  useEffect(() => {
    if (!composerMenuOpen) {
      setComposerHighlightedItemId(null);
      return;
    }
    setComposerHighlightedItemId((existing) =>
      existing && composerMenuItems.some((item) => item.id === existing)
        ? existing
        : (composerMenuItems[0]?.id ?? null),
    );
  }, [composerMenuItems, composerMenuOpen, setComposerHighlightedItemId]);

  const applyPromptReplacement = useCallback(
    (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: { expectedText?: string },
    ): boolean => {
      const currentText = promptRef.current;
      const safeStart = Math.max(0, Math.min(currentText.length, rangeStart));
      const safeEnd = Math.max(safeStart, Math.min(currentText.length, rangeEnd));
      if (
        options?.expectedText !== undefined &&
        currentText.slice(safeStart, safeEnd) !== options.expectedText
      ) {
        return false;
      }
      const next = replaceTextRange(promptRef.current, rangeStart, rangeEnd, replacement);
      const nextCursor = collapseExpandedComposerCursor(next.text, next.cursor);
      const nextExpandedCursor = expandCollapsedComposerCursor(next.text, nextCursor);
      promptRef.current = next.text;
      const activePendingQuestion = activePendingProgress?.activeQuestion;
      if (activePendingQuestion && activePendingUserInput) {
        onChangeActivePendingUserInputCustomAnswer(
          activePendingQuestion.id,
          next.text,
          nextCursor,
          nextExpandedCursor,
          false,
        );
      } else {
        setPrompt(next.text);
        setComposerCursor(nextCursor);
        setComposerTrigger(detectComposerTrigger(next.text, nextExpandedCursor));
      }
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAt(nextCursor);
      });
      return true;
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInput,
      composerEditorRef,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setComposerCursor,
      setComposerTrigger,
      setPrompt,
    ],
  );

  const readComposerSnapshot = useCallback((): {
    value: string;
    cursor: number;
    expandedCursor: number;
  } => {
    const editorSnapshot = composerEditorRef.current?.readSnapshot();
    if (editorSnapshot) {
      return editorSnapshot;
    }
    return {
      value: promptRef.current,
      cursor: composerCursor,
      expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
    };
  }, [composerCursor, composerEditorRef, promptRef]);

  const resolveActiveComposerTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = readComposerSnapshot();
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
    };
  }, [readComposerSnapshot]);

  const onSelectComposerItem = useCallback(
    (item: ComposerCommandItem) => {
      if (composerSelectLockRef.current) return;
      composerSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        composerSelectLockRef.current = false;
      });
      const { snapshot, trigger } = resolveActiveComposerTrigger();
      if (!trigger) return;
      if (item.type === "path") {
        const replacement = `@${item.path} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "slash-command") {
        if (item.command === "model") {
          const replacement = "/model ";
          const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
            snapshot.value,
            trigger.rangeEnd,
            replacement,
          );
          const applied = applyPromptReplacement(
            trigger.rangeStart,
            replacementRangeEnd,
            replacement,
            { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
          );
          if (applied) {
            setComposerHighlightedItemId(null);
          }
          return;
        }
        handleInteractionModeChange(item.command === "plan" ? "plan" : "default");
        const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      onProviderModelSelect(item.provider, item.model);
      const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
        expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
      });
      if (applied) {
        setComposerHighlightedItemId(null);
      }
    },
    [
      applyPromptReplacement,
      handleInteractionModeChange,
      onProviderModelSelect,
      resolveActiveComposerTrigger,
      setComposerHighlightedItemId,
    ],
  );

  const onComposerMenuItemHighlighted = useCallback(
    (itemId: string | null) => {
      setComposerHighlightedItemId(itemId);
    },
    [setComposerHighlightedItemId],
  );

  const nudgeComposerMenuHighlight = useCallback(
    (key: "ArrowDown" | "ArrowUp") => {
      if (composerMenuItems.length === 0) {
        return;
      }
      const highlightedIndex = composerMenuItems.findIndex(
        (item) => item.id === composerHighlightedItemId,
      );
      const normalizedIndex =
        highlightedIndex >= 0 ? highlightedIndex : key === "ArrowDown" ? -1 : 0;
      const offset = key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (normalizedIndex + offset + composerMenuItems.length) % composerMenuItems.length;
      const nextItem = composerMenuItems[nextIndex];
      setComposerHighlightedItemId(nextItem?.id ?? null);
    },
    [composerHighlightedItemId, composerMenuItems, setComposerHighlightedItemId],
  );

  const onPromptChange = useCallback(
    (
      nextPrompt: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
    ) => {
      if (activePendingProgress?.activeQuestion && activePendingUserInput) {
        onChangeActivePendingUserInputCustomAnswer(
          activePendingProgress.activeQuestion.id,
          nextPrompt,
          nextCursor,
          expandedCursor,
          cursorAdjacentToMention,
        );
        return;
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
      );
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInput,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setComposerCursor,
      setComposerTrigger,
      setPrompt,
    ],
  );

  const onComposerCommandKey = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent) => {
      if (key === "Tab" && event.shiftKey) {
        toggleInteractionMode();
        return true;
      }

      const { trigger } = resolveActiveComposerTrigger();
      const menuIsActive = composerMenuOpenRef.current || trigger !== null;

      if (menuIsActive) {
        const currentItems = composerMenuItemsRef.current;
        if (key === "ArrowDown" && currentItems.length > 0) {
          nudgeComposerMenuHighlight("ArrowDown");
          return true;
        }
        if (key === "ArrowUp" && currentItems.length > 0) {
          nudgeComposerMenuHighlight("ArrowUp");
          return true;
        }
        if (key === "Tab" || key === "Enter") {
          const selectedItem = activeComposerMenuItemRef.current ?? currentItems[0];
          if (selectedItem) {
            onSelectComposerItem(selectedItem);
            return true;
          }
        }
      }

      if (key === "Enter" && !event.shiftKey) {
        void handleSubmit();
        return true;
      }
      return false;
    },
    [
      handleSubmit,
      nudgeComposerMenuHighlight,
      onSelectComposerItem,
      resolveActiveComposerTrigger,
      toggleInteractionMode,
    ],
  );

  const addComposerImages = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      if (pendingUserInputs.length > 0) {
        toastManager.add({
          type: "error",
          title: "Attach images after answering plan questions.",
        });
        return;
      }

      const nextImages: ComposerImageAttachment[] = [];
      let nextImageCount = composerImages.length;
      let error: string | null = null;
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          error = `Unsupported file type for '${file.name}'. Please attach image files only.`;
          continue;
        }
        if (file.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
          error = `'${file.name}' exceeds the ${IMAGE_SIZE_LIMIT_LABEL} attachment limit.`;
          continue;
        }
        if (nextImageCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
          error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`;
          break;
        }

        const previewUrl = URL.createObjectURL(file);
        nextImages.push({
          type: "image",
          id: randomUUID(),
          name: file.name || "image",
          mimeType: file.type,
          sizeBytes: file.size,
          previewUrl,
          file,
        });
        nextImageCount += 1;
      }

      if (nextImages.length === 1 && nextImages[0]) {
        addComposerImage(nextImages[0]);
      } else if (nextImages.length > 1) {
        addComposerImagesToDraft(nextImages);
      }
      setThreadError(activeThread.id, error);
    },
    [
      activeThread.id,
      addComposerImage,
      addComposerImagesToDraft,
      composerImages.length,
      pendingUserInputs.length,
      setThreadError,
    ],
  );

  const removeComposerImage = useCallback(
    (imageId: string) => {
      removeComposerImageFromDraft(imageId);
    },
    [removeComposerImageFromDraft],
  );

  const onPreviewComposerImage = useCallback(
    (imageId: string) => {
      const preview = buildExpandedImagePreview(composerImages, imageId);
      if (!preview) return;
      setExpandedImage(preview);
    },
    [composerImages, setExpandedImage],
  );

  const onComposerPaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) {
        return;
      }
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        return;
      }
      event.preventDefault();
      addComposerImages(imageFiles);
    },
    [addComposerImages],
  );

  const onComposerDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverComposer(true);
  }, []);

  const onComposerDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOverComposer(true);
  }, []);

  const onComposerDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOverComposer(false);
    }
  }, []);

  const onComposerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("Files")) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverComposer(false);
      const files = Array.from(event.dataTransfer.files);
      addComposerImages(files);
      focusComposer();
    },
    [addComposerImages, focusComposer],
  );

  return (
    <div className={cn("px-3 pt-1.5 sm:px-5 sm:pt-2", isGitRepo ? "pb-1" : "pb-3 sm:pb-4")}>
      <form
        ref={composerFormRef}
        onSubmit={handleSubmit}
        className="mx-auto w-full min-w-0 max-w-3xl"
        data-chat-composer-form="true"
      >
        <div
          className={`group rounded-[20px] border bg-card transition-colors duration-200 focus-within:border-ring/45 ${
            isDragOverComposer ? "border-primary/70 bg-accent/30" : "border-border"
          }`}
          onDragEnter={onComposerDragEnter}
          onDragOver={onComposerDragOver}
          onDragLeave={onComposerDragLeave}
          onDrop={onComposerDrop}
        >
          {activePendingApproval ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingApprovalPanel
                approval={activePendingApproval}
                pendingCount={pendingApprovals.length}
              />
            </div>
          ) : pendingUserInputs.length > 0 ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingUserInputPanel
                pendingUserInputs={pendingUserInputs}
                respondingRequestIds={respondingUserInputRequestIds}
                answers={activePendingDraftAnswers}
                questionIndex={activePendingQuestionIndex}
                onSelectOption={onSelectActivePendingUserInputOption}
                onAdvance={onAdvanceActivePendingUserInput}
              />
            </div>
          ) : showPlanFollowUpPrompt && activeProposedPlan ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPlanFollowUpBanner
                key={activeProposedPlan.id}
                planTitle={proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null}
              />
            </div>
          ) : null}

          <div
            className={cn(
              "relative px-3 pb-2 sm:px-4",
              hasComposerHeader ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-4",
            )}
          >
            {composerMenuOpen && !isComposerApprovalState && (
              <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
                <ComposerCommandMenu
                  items={composerMenuItems}
                  resolvedTheme={resolvedTheme}
                  isLoading={isComposerMenuLoading}
                  triggerKind={composerTriggerKind}
                  activeItemId={activeComposerMenuItem?.id ?? null}
                  onHighlightedItemChange={onComposerMenuItemHighlighted}
                  onSelect={onSelectComposerItem}
                />
              </div>
            )}

            {!isComposerApprovalState &&
              pendingUserInputs.length === 0 &&
              composerImages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {composerImages.map((image) => (
                    <div
                      key={image.id}
                      className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background"
                    >
                      {image.previewUrl ? (
                        <button
                          type="button"
                          className="h-full w-full cursor-zoom-in"
                          aria-label={`Preview ${image.name}`}
                          onClick={() => {
                            onPreviewComposerImage(image.id);
                          }}
                        >
                          <img
                            src={image.previewUrl}
                            alt={image.name}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/70">
                          {image.name}
                        </div>
                      )}
                      {nonPersistedComposerImageIdSet.has(image.id) && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                role="img"
                                aria-label="Draft attachment may not persist"
                                className="absolute left-1 top-1 inline-flex items-center justify-center rounded bg-background/85 p-0.5 text-amber-600"
                              >
                                <CircleAlertIcon className="size-3" />
                              </span>
                            }
                          />
                          <TooltipPopup
                            side="top"
                            className="max-w-64 whitespace-normal leading-tight"
                          >
                            Draft attachment could not be saved locally and may be lost on
                            navigation.
                          </TooltipPopup>
                        </Tooltip>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1 top-1 bg-background/80 hover:bg-background/90"
                        onClick={() => removeComposerImage(image.id)}
                        aria-label={`Remove ${image.name}`}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            <ComposerPromptEditor
              ref={composerEditorRef}
              value={composerValue}
              cursor={composerCursor}
              onChange={onPromptChange}
              onCommandKeyDown={onComposerCommandKey}
              onPaste={onComposerPaste}
              placeholder={composerPlaceholder}
              disabled={composerDisabled}
            />
          </div>

          {activePendingApproval ? (
            <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
              <ComposerPendingApprovalActions
                requestId={activePendingApproval.requestId}
                isResponding={respondingApprovalRequestIds.includes(
                  activePendingApproval.requestId,
                )}
                onRespondToApproval={handleRespondToApproval}
              />
            </div>
          ) : (
            <div
              data-chat-composer-footer="true"
              className={cn(
                "flex items-center justify-between px-2.5 pb-2.5 sm:px-3 sm:pb-3",
                isComposerFooterCompact ? "gap-1.5" : "flex-wrap gap-2 sm:flex-nowrap sm:gap-0",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center",
                  isComposerFooterCompact
                    ? "gap-1 overflow-hidden"
                    : "gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-max sm:overflow-visible",
                )}
              >
                <ProviderModelPicker
                  compact={isComposerFooterCompact}
                  provider={selectedProvider}
                  model={selectedModelForPickerWithCustomFallback}
                  lockedProvider={lockedProvider}
                  modelOptionsByProvider={modelOptionsByProvider}
                  onProviderModelChange={onProviderModelSelect}
                />

                {isComposerFooterCompact ? (
                  <CompactComposerControlsMenu
                    activePlan={Boolean(activePlan || activeProposedPlan || planSidebarOpen)}
                    interactionMode={interactionMode}
                    planSidebarOpen={planSidebarOpen}
                    runtimeMode={runtimeMode}
                    selectedEffort={selectedEffort}
                    selectedProvider={selectedProvider}
                    selectedCodexFastModeEnabled={selectedCodexFastModeEnabled}
                    reasoningOptions={reasoningOptions}
                    onEffortSelect={onEffortSelect}
                    onCodexFastModeChange={onCodexFastModeChange}
                    onToggleInteractionMode={toggleInteractionMode}
                    onTogglePlanSidebar={togglePlanSidebar}
                    onToggleRuntimeMode={toggleRuntimeMode}
                  />
                ) : (
                  <>
                    {selectedProvider === "codex" && selectedEffort != null ? (
                      <>
                        <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                        <CodexTraitsPicker
                          effort={selectedEffort}
                          fastModeEnabled={selectedCodexFastModeEnabled}
                          options={reasoningOptions}
                          onEffortChange={onEffortSelect}
                          onFastModeChange={onCodexFastModeChange}
                        />
                      </>
                    ) : null}

                    <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

                    <Button
                      variant="ghost"
                      className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
                      size="sm"
                      type="button"
                      onClick={toggleInteractionMode}
                      title={
                        interactionMode === "plan"
                          ? "Plan mode - click to return to normal chat mode"
                          : "Default mode - click to enter plan mode"
                      }
                    >
                      <BotIcon />
                      <span className="sr-only sm:not-sr-only">
                        {interactionMode === "plan" ? "Plan" : "Chat"}
                      </span>
                    </Button>

                    <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

                    <Button
                      variant="ghost"
                      className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
                      size="sm"
                      type="button"
                      onClick={toggleRuntimeMode}
                      title={
                        runtimeMode === "full-access"
                          ? "Full access - click to require approvals"
                          : "Approval required - click for full access"
                      }
                    >
                      {runtimeMode === "full-access" ? <LockOpenIcon /> : <LockIcon />}
                      <span className="sr-only sm:not-sr-only">
                        {runtimeMode === "full-access" ? "Full access" : "Supervised"}
                      </span>
                    </Button>

                    {activePlan || activeProposedPlan || planSidebarOpen ? (
                      <>
                        <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                        <Button
                          variant="ghost"
                          className={cn(
                            "shrink-0 whitespace-nowrap px-2 sm:px-3",
                            planSidebarOpen
                              ? "text-blue-400 hover:text-blue-300"
                              : "text-muted-foreground/70 hover:text-foreground/80",
                          )}
                          size="sm"
                          type="button"
                          onClick={togglePlanSidebar}
                          title={planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
                        >
                          <ListTodoIcon />
                          <span className="sr-only sm:not-sr-only">Plan</span>
                        </Button>
                      </>
                    ) : null}
                  </>
                )}
              </div>

              <div data-chat-composer-actions="right" className="flex shrink-0 items-center gap-2">
                {isPreparingWorktree ? (
                  <span className="text-muted-foreground/70 text-xs">Preparing worktree...</span>
                ) : null}
                {activePendingProgress ? (
                  <div className="flex items-center gap-2">
                    {activePendingProgress.questionIndex > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={onPreviousActivePendingUserInputQuestion}
                        disabled={activePendingIsResponding}
                      >
                        Previous
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      size="sm"
                      className="rounded-full px-4"
                      disabled={
                        activePendingIsResponding ||
                        (activePendingProgress.isLastQuestion
                          ? !activePendingResolvedAnswers
                          : !activePendingProgress.canAdvance)
                      }
                    >
                      {activePendingIsResponding
                        ? "Submitting..."
                        : activePendingProgress.isLastQuestion
                          ? "Submit answers"
                          : "Next question"}
                    </Button>
                  </div>
                ) : phase === "running" ? (
                  <button
                    type="button"
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 sm:h-8 sm:w-8"
                    onClick={() => void onInterrupt()}
                    aria-label="Stop generation"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="2" y="2" width="8" height="8" rx="1.5" />
                    </svg>
                  </button>
                ) : pendingUserInputs.length === 0 ? (
                  showPlanFollowUpPrompt ? (
                    prompt.trim().length > 0 ? (
                      <Button
                        type="submit"
                        size="sm"
                        className="h-9 rounded-full px-4 sm:h-8"
                        disabled={isSendBusy || isConnecting}
                      >
                        {isConnecting || isSendBusy ? "Sending..." : "Refine"}
                      </Button>
                    ) : (
                      <div className="flex items-center">
                        <Button
                          type="submit"
                          size="sm"
                          className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
                          disabled={isSendBusy || isConnecting}
                        >
                          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
                        </Button>
                        <Menu>
                          <MenuTrigger
                            render={
                              <Button
                                size="sm"
                                variant="default"
                                className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                                aria-label="Implementation actions"
                                disabled={isSendBusy || isConnecting}
                              />
                            }
                          >
                            <ChevronDownIcon className="size-3.5" />
                          </MenuTrigger>
                          <MenuPopup align="end" side="top">
                            <MenuItem
                              disabled={isSendBusy || isConnecting}
                              onClick={() => void onImplementPlanInNewThread()}
                            >
                              Implement in new thread
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      </div>
                    )
                  ) : (
                    <button
                      type="submit"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-all duration-150 hover:bg-primary hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 sm:h-8 sm:w-8"
                      disabled={
                        isSendBusy ||
                        isConnecting ||
                        (!prompt.trim() && composerImages.length === 0)
                      }
                      aria-label={
                        isConnecting
                          ? "Connecting"
                          : isPreparingWorktree
                            ? "Preparing worktree"
                            : isSendBusy
                              ? "Sending"
                              : "Send message"
                      }
                    >
                      {isConnecting || isSendBusy ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="animate-spin"
                          aria-hidden="true"
                        >
                          <circle
                            cx="7"
                            cy="7"
                            r="5.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeDasharray="20 12"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
