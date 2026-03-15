import {
  type ApprovalRequestId,
  DEFAULT_MODEL_BY_PROVIDER,
  type EditorId,
  type KeybindingCommand,
  type CodexReasoningEffort,
  type MessageId,
  type ProjectId,
  type ProjectEntry,
  type ProjectScript,
  type ModelSlug,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ResolvedKeybindingsConfig,
  type ProviderApprovalDecision,
  type ServerProviderStatus,
  type ProviderKind,
  type ThreadId,
  type TurnId,
  OrchestrationThreadActivity,
  RuntimeMode,
  ProviderInteractionMode,
} from "@t3tools/contracts";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  normalizeModelSlug,
  resolveModelSlugForProvider,
} from "@t3tools/shared/model";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { gitBranchesQueryOptions, gitCreateWorktreeMutationOptions } from "~/lib/gitReactQuery";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import { serverConfigQueryOptions, serverQueryKeys } from "~/lib/serverReactQuery";
import { isElectron } from "../env";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import {
  clampCollapsedComposerCursor,
  type ComposerTrigger,
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  parseStandaloneComposerSlashCommand,
  replaceTextRange,
} from "../composer-logic";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveActivePlanState,
  findLatestProposedPlan,
  deriveWorkLogEntries,
  hasToolActivityForTurn,
  isLatestTurnSettled,
  formatElapsed,
} from "../session-logic";
import { isScrollContainerNearBottom } from "../chat-scroll";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import { useStore } from "../store";
import {
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
} from "../proposedPlan";
import { truncateTitle } from "../truncateTitle";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  Thread,
  type ChatMessage,
  type TurnDiffSummary,
} from "../types";
import { basenameOfPath } from "../vscode-icons";
import { useTheme } from "../hooks/useTheme";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import BranchToolbar from "./BranchToolbar";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import PlanSidebar from "./PlanSidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ListTodoIcon,
  LockIcon,
  LockOpenIcon,
  XIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { cn, randomUUID } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { toastManager } from "./ui/toast";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { type NewProjectScriptInput } from "./ProjectScriptsControl";
import {
  commandForProjectScript,
  nextProjectScriptId,
  projectScriptRuntimeEnv,
  projectScriptIdFromCommand,
  setupProjectScript,
} from "~/projectScripts";
import { SidebarTrigger } from "./ui/sidebar";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { resolveAppModelSelection, useAppSettings } from "../appSettings";
import { isTerminalFocused } from "../lib/terminalFocus";
import {
  type ComposerImageAttachment,
  type DraftThreadEnvMode,
  type PersistedComposerImageAttachment,
  useComposerDraftStore,
  useComposerThreadDraft,
} from "../composerDraftStore";
import { shouldUseCompactComposerFooter } from "./composerFooterLayout";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "./ComposerPromptEditor";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import { ChatHeader } from "./chat/ChatHeader";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import { AVAILABLE_PROVIDER_OPTIONS, ProviderModelPicker } from "./chat/ProviderModelPicker";
import { ComposerCommandItem, ComposerCommandMenu } from "./chat/ComposerCommandMenu";
import { ComposerPendingApprovalActions } from "./chat/ComposerPendingApprovalActions";
import { CodexTraitsPicker } from "./chat/CodexTraitsPicker";
import { CompactComposerControlsMenu } from "./chat/CompactComposerControlsMenu";
import { ComposerPendingApprovalPanel } from "./chat/ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./chat/ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./chat/ComposerPlanFollowUpBanner";
import { ProviderHealthBanner } from "./chat/ProviderHealthBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import {
  buildLocalDraftThread,
  buildTemporaryWorktreeBranchName,
  cloneComposerImageForRetry,
  collectUserMessageBlobPreviewUrls,
  getCustomModelOptionsByProvider,
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
  PullRequestDialogState,
  readFileAsDataUrl,
  revokeBlobPreviewUrl,
  revokeUserMessagePreviewUrls,
  SendPhase,
} from "./ChatView.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { run } from "effect/FiberSet";
import { createStore, StoreApi } from "zustand";
import NoActiveThread from "./chat/ChatNoActiveThread";
import { ChatViewStoreProvider, useChatViewStore } from "./ChatViewStoreProvider";
import useProjectScripts from "~/hooks/chat/useProjectScripts";

const ATTACHMENT_PREVIEW_HANDOFF_TTL_MS = 5000;
const IMAGE_SIZE_LIMIT_LABEL = `${Math.round(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;
const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const EMPTY_PROJECT_ENTRIES: ProjectEntry[] = [];
const EMPTY_AVAILABLE_EDITORS: EditorId[] = [];
const EMPTY_PROVIDER_STATUSES: ServerProviderStatus[] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};
const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;
const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

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

interface ChatViewProps {
  threadId: ThreadId;
}

export default function ChatView({ threadId }: ChatViewProps) {
  const activeThread = useActiveThread(threadId);

  // Empty state: no active thread
  if (!activeThread) {
    return <NoActiveThread />;
  }

  return (
    <ChatViewStoreProvider key={threadId} threadId={threadId}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        {/* Top bar */}
        <ChatHeader activeThread={activeThread} />

        {/* Error banner */}
        <ProviderHealthBanner status={activeProviderStatus} />
        <ThreadErrorBanner
          error={activeThread.error}
          onDismiss={() => setThreadError(activeThread.id, null)}
        />
        {/* Main content area with optional plan sidebar */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Chat column */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Messages */}
            <div
              ref={setMessagesScrollContainerRef}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
              onScroll={onMessagesScroll}
              onClickCapture={onMessagesClickCapture}
              onWheel={onMessagesWheel}
              onPointerDown={onMessagesPointerDown}
              onPointerUp={onMessagesPointerUp}
              onPointerCancel={onMessagesPointerCancel}
              onTouchStart={onMessagesTouchStart}
              onTouchMove={onMessagesTouchMove}
              onTouchEnd={onMessagesTouchEnd}
              onTouchCancel={onMessagesTouchEnd}
            >
              <MessagesTimeline
                key={activeThread.id}
                activeThread={activeThread}
                hasMessages={timelineEntries.length > 0}
                scrollContainer={messagesScrollElement}
              />
            </div>

            {/* Input bar */}
            <div className={cn("px-3 pt-1.5 sm:px-5 sm:pt-2", isGitRepo ? "pb-1" : "pb-3 sm:pb-4")}>
              <form
                ref={composerFormRef}
                onSubmit={onSend}
                className="mx-auto w-full min-w-0 max-w-3xl"
                data-chat-composer-form="true"
              >
                <div
                  className={`group rounded-[20px] border bg-card transition-colors duration-200 focus-within:border-ring/45 ${isDragOverComposer ? "border-primary/70 bg-accent/30" : "border-border"
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

                  {/* Textarea area */}
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
                                    const preview = buildExpandedImagePreview(
                                      composerImages,
                                      image.id,
                                    );
                                    if (!preview) return;
                                    setExpandedImage(preview);
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
                      value={
                        isComposerApprovalState
                          ? ""
                          : activePendingProgress
                            ? activePendingProgress.customAnswer
                            : prompt
                      }
                      cursor={composerCursor}
                      onChange={onPromptChange}
                      onCommandKeyDown={onComposerCommandKey}
                      onPaste={onComposerPaste}
                      placeholder={
                        isComposerApprovalState
                          ? (activePendingApproval?.detail ??
                            "Resolve this approval request to continue")
                          : activePendingProgress
                            ? "Type your own answer, or leave this blank to use the selected option"
                            : showPlanFollowUpPrompt && activeProposedPlan
                              ? "Add feedback to refine the plan, or leave this blank to implement it"
                              : phase === "disconnected"
                                ? "Ask for follow-up changes or attach images"
                                : "Ask anything, @tag files/folders, or use / to show available commands"
                      }
                      disabled={isConnecting || isComposerApprovalState}
                    />
                  </div>

                  {/* Bottom toolbar */}
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
                        isComposerFooterCompact
                          ? "gap-1.5"
                          : "flex-wrap gap-2 sm:flex-nowrap sm:gap-0",
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
                        {/* Provider/model picker */}
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
                                <Separator
                                  orientation="vertical"
                                  className="mx-0.5 hidden h-4 sm:block"
                                />
                                <CodexTraitsPicker
                                  effort={selectedEffort}
                                  fastModeEnabled={selectedCodexFastModeEnabled}
                                  options={reasoningOptions}
                                  onEffortChange={onEffortSelect}
                                  onFastModeChange={onCodexFastModeChange}
                                />
                              </>
                            ) : null}

                            <Separator
                              orientation="vertical"
                              className="mx-0.5 hidden h-4 sm:block"
                            />

                            <Button
                              variant="ghost"
                              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
                              size="sm"
                              type="button"
                              onClick={toggleInteractionMode}
                              title={
                                interactionMode === "plan"
                                  ? "Plan mode — click to return to normal chat mode"
                                  : "Default mode — click to enter plan mode"
                              }
                            >
                              <BotIcon />
                              <span className="sr-only sm:not-sr-only">
                                {interactionMode === "plan" ? "Plan" : "Chat"}
                              </span>
                            </Button>

                            <Separator
                              orientation="vertical"
                              className="mx-0.5 hidden h-4 sm:block"
                            />

                            <Button
                              variant="ghost"
                              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
                              size="sm"
                              type="button"
                              onClick={() =>
                                void handleRuntimeModeChange(
                                  runtimeMode === "full-access" ? "approval-required" : "full-access",
                                )
                              }
                              title={
                                runtimeMode === "full-access"
                                  ? "Full access — click to require approvals"
                                  : "Approval required — click for full access"
                              }
                            >
                              {runtimeMode === "full-access" ? <LockOpenIcon /> : <LockIcon />}
                              <span className="sr-only sm:not-sr-only">
                                {runtimeMode === "full-access" ? "Full access" : "Supervised"}
                              </span>
                            </Button>

                            {activePlan || activeProposedPlan || planSidebarOpen ? (
                              <>
                                <Separator
                                  orientation="vertical"
                                  className="mx-0.5 hidden h-4 sm:block"
                                />
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

                      {/* Right side: send / stop button */}
                      <div
                        data-chat-composer-actions="right"
                        className="flex shrink-0 items-center gap-2"
                      >
                        {isPreparingWorktree ? (
                          <span className="text-muted-foreground/70 text-xs">
                            Preparing worktree...
                          </span>
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

            {isGitRepo && (
              <BranchToolbar
                threadId={activeThread.id}
                onEnvModeChange={onEnvModeChange}
                envLocked={envLocked}
                onComposerFocusRequest={scheduleComposerFocus}
                {...(canCheckoutPullRequestIntoThread
                  ? { onCheckoutPullRequestRequest: openPullRequestDialog }
                  : {})}
              />
            )}
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
          {/* end chat column */}

          {/* Plan sidebar */}
          {planSidebarOpen ? (
            <PlanSidebar
              activePlan={activePlan}
              activeProposedPlan={activeProposedPlan}
              markdownCwd={gitCwd ?? undefined}
              workspaceRoot={activeProject?.cwd ?? undefined}
              timestampFormat={timestampFormat}
              onClose={() => {
                setPlanSidebarOpen(false);
                // Track that the user explicitly dismissed for this turn so auto-open won't fight them.
                const turnKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
                if (turnKey) {
                  planSidebarDismissedForTurnRef.current = turnKey;
                }
              }}
            />
          ) : null}
        </div>
        {/* end horizontal flex container */}

        {(() => {
          if (!terminalState.terminalOpen || !activeProject) {
            return null;
          }
          return (
            <ThreadTerminalDrawer
              key={activeThread.id}
              threadId={activeThread.id}
              cwd={gitCwd ?? activeProject.cwd}
              runtimeEnv={threadTerminalRuntimeEnv}
              height={terminalState.terminalHeight}
              terminalIds={terminalState.terminalIds}
              activeTerminalId={terminalState.activeTerminalId}
              terminalGroups={terminalState.terminalGroups}
              activeTerminalGroupId={terminalState.activeTerminalGroupId}
              focusRequestId={terminalFocusRequestId}
              onSplitTerminal={splitTerminal}
              onNewTerminal={createNewTerminal}
              splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
              newShortcutLabel={newTerminalShortcutLabel ?? undefined}
              closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
              onActiveTerminalChange={activateTerminal}
              onCloseTerminal={closeTerminal}
              onHeightChange={setTerminalHeight}
            />
          );
        })()}

        {expandedImage && expandedImageItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag]"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded image preview"
          >
            <button
              type="button"
              className="absolute inset-0 z-0 cursor-zoom-out"
              aria-label="Close image preview"
              onClick={closeExpandedImage}
            />
            {expandedImage.images.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:left-6"
                aria-label="Previous image"
                onClick={() => {
                  navigateExpandedImage(-1);
                }}
              >
                <ChevronLeftIcon className="size-5" />
              </Button>
            )}
            <div className="relative isolate z-10 max-h-[92vh] max-w-[92vw]">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="absolute right-2 top-2"
                onClick={closeExpandedImage}
                aria-label="Close image preview"
              >
                <XIcon />
              </Button>
              <img
                src={expandedImageItem.src}
                alt={expandedImageItem.name}
                className="max-h-[86vh] max-w-[92vw] select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
                draggable={false}
              />
              <p className="mt-2 max-w-[92vw] truncate text-center text-xs text-muted-foreground/80">
                {expandedImageItem.name}
                {expandedImage.images.length > 1
                  ? ` (${expandedImage.index + 1}/${expandedImage.images.length})`
                  : ""}
              </p>
            </div>
            {expandedImage.images.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:right-6"
                aria-label="Next image"
                onClick={() => {
                  navigateExpandedImage(1);
                }}
              >
                <ChevronRightIcon className="size-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </ChatViewStoreProvider>
  );
}

// TODO: move these out or delete them

function useActiveThread(threadId: ThreadId): Thread | undefined {
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

export function useActiveProject(activeThread: Thread) {
  const projects = useStore((store) => store.projects);
  return projects.find((p) => p.id === activeThread?.projectId);
}


