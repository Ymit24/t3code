import {
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { memo, useMemo } from "react";
import GitActionsControl from "../GitActionsControl";
import { DiffIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { Thread } from "~/types";
import { useQuery } from "@tanstack/react-query";
import { gitBranchesQueryOptions } from "~/lib/gitReactQuery";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";
import { shortcutLabelForCommand } from "~/keybindings";
import { useSearch } from "@tanstack/react-router";
import { parseDiffRouteSearch } from "~/diffRouteSearch";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import {
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
} from "../ChatView.logic";
import { useActiveProject } from "../ChatView";
import useProjectScripts from "~/hooks/chat/useProjectScripts";
import useToggleDiff from "~/hooks/chat/useToggleDiff";
import { cn } from "~/lib/utils";
import { isElectron } from "~/env";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const EMPTY_AVAILABLE_EDITORS: EditorId[] = [];

interface ChatHeaderProps {
  activeThread: Thread;
}

export const ChatHeader = memo(function ChatHeader({
  activeThread,
}: ChatHeaderProps) {
  const activeProject = useActiveProject(activeThread);
  const { onToggleDiff } = useToggleDiff(activeThread.id);

  const {
    runProjectScript,
    saveProjectScript,
    updateProjectScript,
    deleteProjectScript,
  } = useProjectScripts(activeThread);

  const gitCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;

  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const branchesQuery = useQuery(gitBranchesQueryOptions(gitCwd));

  const isGitRepo = branchesQuery.data?.isRepo ?? true;

  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const availableEditors = serverConfigQuery.data?.availableEditors ?? EMPTY_AVAILABLE_EDITORS;

  const activeThreadTitle = activeThread.title;
  const activeProjectName = activeProject?.name;
  const openInCwd = activeThread.worktreePath ?? activeProject?.cwd ?? null;

  const diffPanelShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "diff.toggle"),
    [keybindings],
  );

  const rawSearch = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });

  const diffOpen = rawSearch.diff === "1";

  const [lastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );

  const activeProjectScripts = activeProject?.scripts;

  const preferredScriptId = activeProject
    ? (lastInvokedScriptByProjectId[activeProject.id] ?? null)
    : null;

  return (
    <header
      className={cn(
        "border-b border-border px-3 sm:px-5",
        isElectron ? "drag-region flex h-[52px] items-center" : "py-2 sm:py-3",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <SidebarTrigger className="size-7 shrink-0 md:hidden" />
          <h2
            className="min-w-0 shrink truncate text-sm font-medium text-foreground"
            title={activeThreadTitle}
          >
            {activeThreadTitle}
          </h2>
          {activeProjectName && (
            <Badge variant="outline" className="min-w-0 shrink truncate">
              {activeProjectName}
            </Badge>
          )}
          {activeProjectName && !isGitRepo && (
            <Badge variant="outline" className="shrink-0 text-[10px] text-amber-700">
              No Git
            </Badge>
          )}
        </div>
        <div className="@container/header-actions flex min-w-0 flex-1 items-center justify-end gap-2 @sm/header-actions:gap-3">
          {activeProjectScripts && (
            <ProjectScriptsControl
              scripts={activeProjectScripts}
              keybindings={keybindings}
              preferredScriptId={preferredScriptId}
              onRunScript={runProjectScript}
              onAddScript={saveProjectScript}
              onUpdateScript={updateProjectScript}
              onDeleteScript={deleteProjectScript}
            />
          )}
          {activeProjectName && (
            <OpenInPicker
              keybindings={keybindings}
              availableEditors={availableEditors}
              openInCwd={openInCwd}
            />
          )}
          {activeProjectName && (
            <GitActionsControl gitCwd={gitCwd} activeThreadId={activeThread.id} />
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  className="shrink-0"
                  pressed={diffOpen}
                  onPressedChange={onToggleDiff}
                  aria-label="Toggle diff panel"
                  variant="outline"
                  size="xs"
                  disabled={!isGitRepo}
                >
                  <DiffIcon className="size-3" />
                </Toggle>
              }
            />
            <TooltipPopup side="bottom">
              {!isGitRepo
                ? "Diff panel is unavailable because this project is not a git repository."
                : diffPanelShortcutLabel
                  ? `Toggle diff panel (${diffPanelShortcutLabel})`
                  : "Toggle diff panel"}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </header>
  );
});
