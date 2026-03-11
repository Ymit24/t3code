import { DEFAULT_MODEL_BY_PROVIDER, type ThreadId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { isElectron } from "../env";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  deriveActivePlanState,
  findLatestProposedPlan,
  isLatestTurnSettled,
} from "../session-logic";
import { useStore } from "../store";
import { useTheme } from "../hooks/useTheme";
import { type Thread } from "../types";
import { cn } from "~/lib/utils";
import { SidebarTrigger } from "./ui/sidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import PlanSidebar from "./PlanSidebar";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatThreadContent } from "./chat/ChatThreadContent";
import { ProviderHealthBanner } from "./chat/ProviderHealthBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import { buildLocalDraftThread } from "./ChatView.logic";
import { usePlanSidebarState } from "./chat/usePlanSidebarState";
import { useThreadRuntimeControls } from "./chat/useThreadRuntimeControls";

interface ChatViewProps {
  threadId: ThreadId;
}

export default function ChatView({ threadId }: ChatViewProps) {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const markThreadVisited = useStore((store) => store.markThreadVisited);
  const setStoreThreadError = useStore((store) => store.setError);
  const navigate = useNavigate();
  const rawSearch = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const { resolvedTheme } = useTheme();
  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const [localDraftErrorsByThreadId, setLocalDraftErrorsByThreadId] = useState<
    Record<ThreadId, string | null>
  >({});

  const serverThread = threads.find((thread) => thread.id === threadId);
  const fallbackDraftProject = projects.find((project) => project.id === draftThread?.projectId);
  const localDraftError = serverThread ? null : (localDraftErrorsByThreadId[threadId] ?? null);
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
  const activeProject = projects.find((project) => project.id === activeThread?.projectId);
  const isServerThread = serverThread !== undefined;
  const isLocalDraftThread = !isServerThread && localDraftThread !== undefined;
  const diffOpen = rawSearch.diff === "1";
  const gitCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);
  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);
  const activePlan = useMemo(
    () => deriveActivePlanState(activeThread?.activities ?? [], activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, activeThread?.activities],
  );

  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      if (threads.some((thread) => thread.id === targetThreadId)) {
        setStoreThreadError(targetThreadId, error);
        return;
      }
      setLocalDraftErrorsByThreadId((existing) => {
        if ((existing[targetThreadId] ?? null) === error) {
          return existing;
        }
        return {
          ...existing,
          [targetThreadId]: error,
        };
      });
    },
    [setStoreThreadError, threads],
  );

  const onToggleDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return diffOpen ? rest : { ...rest, diff: "1" };
      },
    });
  }, [diffOpen, navigate, threadId]);

  const planSidebarState = usePlanSidebarState({
    activeThreadId: activeThread?.id ?? null,
    activePlanTurnId: activePlan?.turnId ?? null,
    activeProposedPlanTurnId: activeProposedPlan?.turnId ?? null,
  });

  const runtimeControls = useThreadRuntimeControls({
    activeProject,
    activeThread,
    gitCwd,
    isServerThread,
    onToggleDiff,
    setThreadError,
    threadId,
  });

  useEffect(() => {
    if (!activeThread?.id) return;
    if (!latestTurnSettled) return;
    if (!activeLatestTurn?.completedAt) return;
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnCompletedAt)) return;
    const lastVisitedAt = activeThread.lastVisitedAt ? Date.parse(activeThread.lastVisitedAt) : NaN;
    if (!Number.isNaN(lastVisitedAt) && lastVisitedAt >= turnCompletedAt) return;
    markThreadVisited(activeThread.id);
  }, [
    activeLatestTurn?.completedAt,
    activeThread?.id,
    activeThread?.lastVisitedAt,
    latestTurnSettled,
    markThreadVisited,
  ]);

  if (!activeThread) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 md:hidden">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-foreground">Threads</span>
            </div>
          </header>
        )}
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs text-muted-foreground/50">No active thread</span>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm">Select a thread or create a new one to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
      <header
        className={cn(
          "border-b border-border px-3 sm:px-5",
          isElectron ? "drag-region flex h-[52px] items-center" : "py-2 sm:py-3",
        )}
      >
        <ChatHeader
          activeThreadId={activeThread.id}
          activeThreadTitle={activeThread.title}
          activeProjectName={activeProject?.name}
          isGitRepo={runtimeControls.isGitRepo}
          openInCwd={activeThread.worktreePath ?? activeProject?.cwd ?? null}
          activeProjectScripts={activeProject?.scripts}
          preferredScriptId={
            activeProject ? (runtimeControls.lastInvokedScriptByProjectId[activeProject.id] ?? null) : null
          }
          keybindings={runtimeControls.keybindings}
          availableEditors={runtimeControls.availableEditors}
          diffToggleShortcutLabel={runtimeControls.diffPanelShortcutLabel}
          gitCwd={gitCwd}
          diffOpen={diffOpen}
          onRunProjectScript={(script) => {
            void runtimeControls.runProjectScript(script);
          }}
          onAddProjectScript={runtimeControls.saveProjectScript}
          onUpdateProjectScript={runtimeControls.updateProjectScript}
          onDeleteProjectScript={runtimeControls.deleteProjectScript}
          onToggleDiff={onToggleDiff}
        />
      </header>

      <ProviderHealthBanner status={runtimeControls.activeProviderStatus} />
      <ThreadErrorBanner
        error={activeThread.error}
        onDismiss={() => setThreadError(activeThread.id, null)}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <ChatThreadContent
          activePlan={activePlan}
          activeProject={activeProject}
          activeProposedPlan={activeProposedPlan}
          activeThread={activeThread as Thread}
          gitCwd={gitCwd}
          isGitRepo={runtimeControls.isGitRepo}
          isLocalDraftThread={isLocalDraftThread}
          isServerThread={isServerThread}
          planSidebarDismissedForTurnRef={planSidebarState.planSidebarDismissedForTurnRef}
          planSidebarOpen={planSidebarState.planSidebarOpen}
          resolvedTheme={resolvedTheme}
          runProjectScript={runtimeControls.runProjectScript}
          setPlanSidebarOpen={planSidebarState.setPlanSidebarOpen}
          setThreadError={setThreadError}
          terminalOpen={runtimeControls.terminalState.terminalOpen}
          threadId={threadId}
          togglePlanSidebar={planSidebarState.togglePlanSidebar}
          markPlanSidebarOpenOnNextThread={planSidebarState.markPlanSidebarOpenOnNextThread}
        />

        {planSidebarState.planSidebarOpen ? (
          <PlanSidebar
            activePlan={activePlan}
            activeProposedPlan={activeProposedPlan}
            markdownCwd={gitCwd ?? undefined}
            workspaceRoot={activeProject?.cwd ?? undefined}
            onClose={planSidebarState.dismissPlanSidebar}
          />
        ) : null}
      </div>

      {runtimeControls.terminalState.terminalOpen && activeProject ? (
        <ThreadTerminalDrawer
          key={activeThread.id}
          threadId={activeThread.id}
          cwd={gitCwd ?? activeProject.cwd}
          runtimeEnv={runtimeControls.threadTerminalRuntimeEnv}
          height={runtimeControls.terminalState.terminalHeight}
          terminalIds={runtimeControls.terminalState.terminalIds}
          activeTerminalId={runtimeControls.terminalState.activeTerminalId}
          terminalGroups={runtimeControls.terminalState.terminalGroups}
          activeTerminalGroupId={runtimeControls.terminalState.activeTerminalGroupId}
          focusRequestId={runtimeControls.terminalFocusRequestId}
          onSplitTerminal={runtimeControls.splitTerminal}
          onNewTerminal={runtimeControls.createNewTerminal}
          splitShortcutLabel={runtimeControls.splitTerminalShortcutLabel ?? undefined}
          newShortcutLabel={runtimeControls.newTerminalShortcutLabel ?? undefined}
          closeShortcutLabel={runtimeControls.closeTerminalShortcutLabel ?? undefined}
          onActiveTerminalChange={runtimeControls.activateTerminal}
          onCloseTerminal={runtimeControls.closeTerminal}
          onHeightChange={runtimeControls.setTerminalHeight}
        />
      ) : null}
    </div>
  );
}
