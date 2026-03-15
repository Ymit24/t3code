import { DEFAULT_THREAD_TERMINAL_ID, ProjectScript, Thread } from "~/types";
import { useActiveProject } from "./useActiveProject";
import { useStore } from "~/store";
import { randomUUID } from "crypto";
import { useCallback } from "react";
import { LAST_INVOKED_SCRIPT_BY_PROJECT_KEY, LastInvokedScriptByProjectSchema } from "~/components/ChatView.logic";
import { useChatViewStore } from "~/components/ChatViewStoreProvider";
import { readNativeApi } from "~/nativeApi";
import { commandForProjectScript, nextProjectScriptId, projectScriptRuntimeEnv } from "~/projectScripts";
import { useTerminalStateStore, selectThreadTerminalState } from "~/terminalStateStore";
import { useLocalStorage } from "../useLocalStorage";
import useIsServerThread from "./useIsServer";
import { NewProjectScriptInput } from "~/components/ProjectScriptsControl";
import { toastManager } from "~/components/ui/toast";


const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

export default function useProjectScripts(activeThread: Thread) {
  const activeProject = useActiveProject(activeThread);
  const isServerThread = useIsServerThread(activeThread);

  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadId, activeThread.id),
  );
  const storeNewTerminal = useTerminalStateStore((s) => s.newTerminal);
  const storeSetActiveTerminal = useTerminalStateStore((s) => s.setActiveTerminal);

  const increaseTerminalFocusRequestId = useChatViewStore((store) => store.increaseTerminalFocusRequestId);

  const [_, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );

  const runProjectScript = useCallback(
    async (
      script: ProjectScript,
      options?: {
        cwd?: string;
        env?: Record<string, string>;
        worktreePath?: string | null;
        preferNewTerminal?: boolean;
        rememberAsLastInvoked?: boolean;
        allowLocalDraftThread?: boolean;
      },
    ) => {
      const api = readNativeApi();
      if (!api || !activeThread.id || !activeProject || !activeThread) return;
      if (!isServerThread && !options?.allowLocalDraftThread) return;
      if (options?.rememberAsLastInvoked !== false) {
        setLastInvokedScriptByProjectId((current) => {
          if (current[activeProject.id] === script.id) return current;
          return { ...current, [activeProject.id]: script.id };
        });
      }
      const targetCwd = options?.cwd ?? gitCwd ?? activeProject.cwd;
      const baseTerminalId =
        terminalState.activeTerminalId ||
        terminalState.terminalIds[0] ||
        DEFAULT_THREAD_TERMINAL_ID;
      const isBaseTerminalBusy = terminalState.runningTerminalIds.includes(baseTerminalId);
      const wantsNewTerminal = Boolean(options?.preferNewTerminal) || isBaseTerminalBusy;
      const shouldCreateNewTerminal = wantsNewTerminal;
      const targetTerminalId = shouldCreateNewTerminal
        ? `terminal-${randomUUID()}`
        : baseTerminalId;

      setTerminalOpen(true);
      if (shouldCreateNewTerminal) {
        storeNewTerminal(activeThread.id, targetTerminalId);
      } else {
        storeSetActiveTerminal(activeThread.id, targetTerminalId);
      }
      increaseTerminalFocusRequestId();

      const runtimeEnv = projectScriptRuntimeEnv({
        project: {
          cwd: activeProject.cwd,
        },
        worktreePath: options?.worktreePath ?? activeThread.worktreePath ?? null,
        ...(options?.env ? { extraEnv: options.env } : {}),
      });
      const openTerminalInput: Parameters<typeof api.terminal.open>[0] = shouldCreateNewTerminal
        ? {
          threadId: activeThread.id,
          terminalId: targetTerminalId,
          cwd: targetCwd,
          env: runtimeEnv,
          cols: SCRIPT_TERMINAL_COLS,
          rows: SCRIPT_TERMINAL_ROWS,
        }
        : {
          threadId: activeThread.id,
          terminalId: targetTerminalId,
          cwd: targetCwd,
          env: runtimeEnv,
        };

      try {
        await api.terminal.open(openTerminalInput);
        await api.terminal.write({
          threadId: activeThread.id,
          terminalId: targetTerminalId,
          data: `${script.command}\r`,
        });
      } catch (error) {
        setThreadError(
          activeThread.id,
          error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
        );
      }
    },
    [
      activeProject,
      activeThread,
      gitCwd,
      isServerThread,
      setTerminalOpen,
      setThreadError,
      storeNewTerminal,
      storeSetActiveTerminal,
      setLastInvokedScriptByProjectId,
      terminalState.activeTerminalId,
      terminalState.runningTerminalIds,
      terminalState.terminalIds,
    ],
  );


  const saveProjectScript = useCallback(
    async (input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const nextId = nextProjectScriptId(
        input.name,
        activeProject.scripts.map((script) => script.id),
      );
      const nextScript: ProjectScript = {
        id: nextId,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = input.runOnWorktreeCreate
        ? [
          ...activeProject.scripts.map((script) =>
            script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
          ),
          nextScript,
        ]
        : [...activeProject.scripts, nextScript];

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [activeProject, persistProjectScripts],
  );

  const updateProjectScript = useCallback(
    async (scriptId: string, input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const existingScript = activeProject.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        throw new Error("Script not found.");
      }

      const updatedScript: ProjectScript = {
        ...existingScript,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = activeProject.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [activeProject, persistProjectScripts],
  );

  const deleteProjectScript = useCallback(
    async (scriptId: string) => {
      if (!activeProject) return;
      const nextScripts = activeProject.scripts.filter((script) => script.id !== scriptId);

      const deletedName = activeProject.scripts.find((s) => s.id === scriptId)?.name;

      try {
        await persistProjectScripts({
          projectId: activeProject.id,
          projectCwd: activeProject.cwd,
          previousScripts: activeProject.scripts,
          nextScripts,
          keybinding: null,
          keybindingCommand: commandForProjectScript(scriptId),
        });
        toastManager.add({
          type: "success",
          title: `Deleted action "${deletedName ?? "Unknown"}"`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not delete action",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      }
    },
    [activeProject, persistProjectScripts],
  );

  return {
    runProjectScript,
    saveProjectScript,
    updateProjectScript,
    deleteProjectScript,
  };
}
