import {
  type EditorId,
  type ProjectEntry,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ResolvedKeybindingsConfig,
  type ServerProviderStatus,
  type ThreadId,
  OrchestrationThreadActivity,
} from "@t3tools/contracts";
import {
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import {
  Thread,
} from "../types";
import BranchToolbar from "./BranchToolbar";
import PlanSidebar from "./PlanSidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { ChatHeader } from "./chat/ChatHeader";
import { ProviderHealthBanner } from "./chat/ProviderHealthBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import NoActiveThread from "./chat/ChatNoActiveThread";
import { ChatViewStoreProvider, useChatViewStore } from "./ChatViewStoreProvider";
import ChatInputBar from "./chat/ChatInputBar";
import ChatExpandedImageViewer from "./chat/ChatExpandedImageViewer";
import { ChatMessageTimelineArea } from "./chat/ChatMessageTimelineArea";
import { useActiveProject } from "~/hooks/chat/useActiveProject";
import useActiveThread from "~/hooks/chat/useActiveThread";

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
      <ChatViewContent activeThread={activeThread} />
    </ChatViewStoreProvider>
  );
}

function ChatViewContent({ activeThread }: { activeThread: Thread }) {
  const activeProject = useActiveProject(activeThread);

  const pullRequestDialogState = useChatViewStore((store) => store.pullRequestDialogState);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
      {/* Top bar */}
      <ChatHeader activeThread={activeThread} />
      {/* TODO: this may go in like chat header or something */}
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
          <ChatMessageTimelineArea />

          {/* Input bar */}
          <ChatInputBar />

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
        </div>
        {/* end chat column */}

        {/* Plan sidebar */}
        {planSidebarOpen ? (
          <PlanSidebar
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
      <ChatExpandedImageViewer />
    </div>
  )
}
