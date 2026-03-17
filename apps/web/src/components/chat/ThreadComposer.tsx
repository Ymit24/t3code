import {
  type ApprovalRequestId,
  type CodexReasoningEffort,
  type ModelSlug,
  type ProviderApprovalDecision,
  type ProviderKind,
  ProviderInteractionMode,
  RuntimeMode,
  type ProjectEntry,
} from "@t3tools/contracts";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
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
} from "react";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";
import {
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  replaceTextRange,
  type ComposerTrigger,
} from "../../composer-logic";
import {
  type PendingUserInputDraftAnswer,
  type PendingUserInputProgress,
} from "../../pendingUserInput";
import { proposedPlanTitle } from "../../proposedPlan";
import {
  type ActivePlanState,
  type LatestProposedPlanState,
  type PendingApproval,
  type PendingUserInput,
} from "../../session-logic";
import { type SessionPhase } from "../../types";
import { basenameOfPath } from "../../vscode-icons";
import { type ComposerImageAttachment } from "../../composerDraftStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CodexTraitsPicker } from "./CodexTraitsPicker";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { ComposerCommandItem, ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import { ProviderModelPicker } from "./ProviderModelPicker";

const EMPTY_PROJECT_ENTRIES: ProjectEntry[] = [];
const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;

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
  activePlan: ActivePlanState | null;
  activePendingApproval: PendingApproval | null;
  activePendingDraftAnswers: Record<string, PendingUserInputDraftAnswer>;
  activePendingUserInput: PendingUserInput | null;
  activePendingIsResponding: boolean;
  activePendingProgress: PendingUserInputProgress | null;
  activePendingQuestionIndex: number;
  activePendingResolvedAnswers: Record<string, string> | null;
  activeProposedPlan: LatestProposedPlanState | null;
  composerCursor: number;
  composerDisabled: boolean;
  composerEditorRef: RefObject<ComposerPromptEditorHandle | null>;
  composerFormRef: RefObject<HTMLFormElement | null>;
  composerHighlightedItemId: string | null;
  composerImages: ComposerImageAttachment[];
  composerPlaceholder: string;
  composerTrigger: ComposerTrigger | null;
  composerValue: string;
  gitCwd: string | null;
  hasComposerHeader: boolean;
  isComposerApprovalState: boolean;
  isComposerFooterCompact: boolean;
  isConnecting: boolean;
  isDragOverComposer: boolean;
  isGitRepo: boolean;
  isPreparingWorktree: boolean;
  isSendBusy: boolean;
  interactionMode: ProviderInteractionMode;
  lockedProvider: ProviderKind | null;
  modelOptionsByProvider: ComponentProps<typeof ProviderModelPicker>["modelOptionsByProvider"];
  nonPersistedComposerImageIdSet: ReadonlySet<string>;
  onAdvanceActivePendingUserInput: () => void;
  onChangeActivePendingUserInputCustomAnswer: (
    questionId: string,
    value: string,
    nextCursor: number,
    expandedCursor: number,
    cursorAdjacentToMention: boolean,
  ) => void;
  onCodexFastModeChange: (enabled: boolean) => void;
  onComposerDragEnter: ComponentProps<"div">["onDragEnter"];
  onComposerDragLeave: ComponentProps<"div">["onDragLeave"];
  onComposerDragOver: ComponentProps<"div">["onDragOver"];
  onComposerDrop: ComponentProps<"div">["onDrop"];
  onComposerImagePreview: (imageId: string) => void;
  onHandleInteractionModeChange: (mode: ProviderInteractionMode) => void;
  onComposerPaste: ComponentProps<typeof ComposerPromptEditor>["onPaste"];
  onEffortSelect: (effort: CodexReasoningEffort) => void;
  onImplementPlanInNewThread: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onPreviousActivePendingUserInputQuestion: () => void;
  onProviderModelSelect: ComponentProps<typeof ProviderModelPicker>["onProviderModelChange"];
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
  onSelectActivePendingUserInputOption: (questionId: string, optionLabel: string) => void;
  onSubmit: (e?: { preventDefault: () => void }) => Promise<void>;
  pendingApprovalsCount: number;
  pendingUserInputs: PendingUserInput[];
  phase: SessionPhase;
  planSidebarOpen: boolean;
  prompt: string;
  promptRef: RefObject<string>;
  reasoningOptions: ComponentProps<typeof CodexTraitsPicker>["options"];
  removeComposerImage: (imageId: string) => void;
  resolvedTheme: "light" | "dark";
  respondingRequestIds: ApprovalRequestId[];
  respondingUserInputRequestIds: ApprovalRequestId[];
  runtimeMode: RuntimeMode;
  searchableModelOptions: ComposerSearchableModelOption[];
  selectedCodexFastModeEnabled: boolean;
  selectedEffort: CodexReasoningEffort | null;
  selectedModelForPickerWithCustomFallback: ComponentProps<typeof ProviderModelPicker>["model"];
  selectedProvider: ProviderKind;
  setComposerCursor: Dispatch<SetStateAction<number>>;
  setComposerHighlightedItemId: Dispatch<SetStateAction<string | null>>;
  setComposerTrigger: Dispatch<SetStateAction<ComposerTrigger | null>>;
  setPrompt: (nextPrompt: string) => void;
  showPlanFollowUpPrompt: boolean;
  toggleInteractionMode: () => void;
  togglePlanSidebar: () => void;
  toggleRuntimeMode: () => void;
}

export default function ThreadComposer({
  activePlan,
  activePendingApproval,
  activePendingDraftAnswers,
  activePendingUserInput,
  activePendingIsResponding,
  activePendingProgress,
  activePendingQuestionIndex,
  activePendingResolvedAnswers,
  activeProposedPlan,
  composerCursor,
  composerDisabled,
  composerEditorRef,
  composerFormRef,
  composerHighlightedItemId,
  composerImages,
  composerPlaceholder,
  composerTrigger,
  composerValue,
  gitCwd,
  hasComposerHeader,
  isComposerApprovalState,
  isComposerFooterCompact,
  isConnecting,
  isDragOverComposer,
  isGitRepo,
  isPreparingWorktree,
  isSendBusy,
  interactionMode,
  lockedProvider,
  modelOptionsByProvider,
  nonPersistedComposerImageIdSet,
  onAdvanceActivePendingUserInput,
  onChangeActivePendingUserInputCustomAnswer,
  onCodexFastModeChange,
  onComposerDragEnter,
  onComposerDragLeave,
  onComposerDragOver,
  onComposerDrop,
  onComposerImagePreview,
  onHandleInteractionModeChange,
  onComposerPaste,
  onEffortSelect,
  onImplementPlanInNewThread,
  onInterrupt,
  onPreviousActivePendingUserInputQuestion,
  onProviderModelSelect,
  onRespondToApproval,
  onSelectActivePendingUserInputOption,
  onSubmit,
  pendingApprovalsCount,
  pendingUserInputs,
  phase,
  planSidebarOpen,
  prompt,
  promptRef,
  reasoningOptions,
  removeComposerImage,
  resolvedTheme,
  respondingRequestIds,
  respondingUserInputRequestIds,
  runtimeMode,
  searchableModelOptions,
  selectedCodexFastModeEnabled,
  selectedEffort,
  selectedModelForPickerWithCustomFallback,
  selectedProvider,
  setComposerCursor,
  setComposerHighlightedItemId,
  setComposerTrigger,
  setPrompt,
  showPlanFollowUpPrompt,
  toggleInteractionMode,
  togglePlanSidebar,
  toggleRuntimeMode,
}: ThreadComposerProps) {
  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
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
        onHandleInteractionModeChange(item.command === "plan" ? "plan" : "default");
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
      onHandleInteractionModeChange,
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
        void onSubmit();
        return true;
      }
      return false;
    },
    [
      nudgeComposerMenuHighlight,
      onSelectComposerItem,
      onSubmit,
      resolveActiveComposerTrigger,
      toggleInteractionMode,
    ],
  );

  return (
    <div className={cn("px-3 pt-1.5 sm:px-5 sm:pt-2", isGitRepo ? "pb-1" : "pb-3 sm:pb-4")}>
      <form
        ref={composerFormRef}
        onSubmit={onSubmit}
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
                pendingCount={pendingApprovalsCount}
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
                            onComposerImagePreview(image.id);
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
                isResponding={respondingRequestIds.includes(activePendingApproval.requestId)}
                onRespondToApproval={onRespondToApproval}
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
