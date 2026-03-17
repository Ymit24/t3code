import {
  type KeybindingCommand,
  type ProjectId,
  type ProjectScript,
  type ThreadId,
} from "@t3tools/contracts";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isElectron } from "../env";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { type NewProjectScriptInput } from "../components/ProjectScriptsControl";
import {
  commandForProjectScript,
  nextProjectScriptId,
  projectScriptRuntimeEnv,
} from "~/projectScripts";
import { readNativeApi } from "~/nativeApi";
import { newCommandId, randomUUID } from "~/lib/utils";
import { serverQueryKeys } from "~/lib/serverReactQuery";
import { toastManager } from "../components/ui/toast";
import { DEFAULT_THREAD_TERMINAL_ID, type Project, type Thread } from "../types";
import {
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
} from "../components/ChatView.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";

const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

interface UseProjectScriptsInput {
  activeProject: Project | null;
  activeThread: Thread;
  activeThreadId: ThreadId;
  gitCwd: string | null;
  isServerThread: boolean;
  terminalState: {
    activeTerminalId: string;
    runningTerminalIds: string[];
    terminalIds: string[];
  };
  setTerminalOpen: (open: boolean) => void;
  setTerminalFocusRequestId: Dispatch<SetStateAction<number>>;
  storeNewTerminal: (threadId: ThreadId, terminalId: string) => void;
  storeSetActiveTerminal: (threadId: ThreadId, terminalId: string) => void;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
}

export function useProjectScripts(input: UseProjectScriptsInput) {
  const queryClient = useQueryClient();
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
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
      const activeProject = input.activeProject;
      if (!api || !activeProject) return;
      if (!input.isServerThread && !options?.allowLocalDraftThread) return;
      if (options?.rememberAsLastInvoked !== false) {
        setLastInvokedScriptByProjectId((current) => {
          if (current[activeProject.id] === script.id) return current;
          return { ...current, [activeProject.id]: script.id };
        });
      }
      const targetCwd = options?.cwd ?? input.gitCwd ?? activeProject.cwd;
      const baseTerminalId =
        input.terminalState.activeTerminalId ||
        input.terminalState.terminalIds[0] ||
        DEFAULT_THREAD_TERMINAL_ID;
      const isBaseTerminalBusy = input.terminalState.runningTerminalIds.includes(baseTerminalId);
      const shouldCreateNewTerminal = Boolean(options?.preferNewTerminal) || isBaseTerminalBusy;
      const targetTerminalId = shouldCreateNewTerminal
        ? `terminal-${randomUUID()}`
        : baseTerminalId;

      input.setTerminalOpen(true);
      if (shouldCreateNewTerminal) {
        input.storeNewTerminal(input.activeThreadId, targetTerminalId);
      } else {
        input.storeSetActiveTerminal(input.activeThreadId, targetTerminalId);
      }
      input.setTerminalFocusRequestId((value) => value + 1);

      const runtimeEnv = projectScriptRuntimeEnv({
        project: {
          cwd: activeProject.cwd,
        },
        worktreePath: options?.worktreePath ?? input.activeThread.worktreePath ?? null,
        ...(options?.env ? { extraEnv: options.env } : {}),
      });

      try {
        await api.terminal.open(
          shouldCreateNewTerminal
            ? {
                threadId: input.activeThreadId,
                terminalId: targetTerminalId,
                cwd: targetCwd,
                env: runtimeEnv,
                cols: SCRIPT_TERMINAL_COLS,
                rows: SCRIPT_TERMINAL_ROWS,
              }
            : {
                threadId: input.activeThreadId,
                terminalId: targetTerminalId,
                cwd: targetCwd,
                env: runtimeEnv,
              },
        );
        await api.terminal.write({
          threadId: input.activeThreadId,
          terminalId: targetTerminalId,
          data: `${script.command}\r`,
        });
      } catch (error) {
        input.setThreadError(
          input.activeThreadId,
          error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
        );
      }
    },
    [input, setLastInvokedScriptByProjectId],
  );

  const persistProjectScripts = useCallback(
    async (args: {
      projectId: ProjectId;
      nextScripts: ProjectScript[];
      keybinding?: string | null;
      keybindingCommand: KeybindingCommand;
    }) => {
      const api = readNativeApi();
      if (!api) return;

      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: args.projectId,
        scripts: args.nextScripts,
      });

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: args.keybinding,
        command: args.keybindingCommand,
      });

      if (isElectron && keybindingRule) {
        await api.server.upsertKeybinding(keybindingRule);
        await queryClient.invalidateQueries({ queryKey: serverQueryKeys.all });
      }
    },
    [queryClient],
  );

  const saveProjectScript = useCallback(
    async (scriptInput: NewProjectScriptInput) => {
      if (!input.activeProject) return;
      const nextId = nextProjectScriptId(
        scriptInput.name,
        input.activeProject.scripts.map((script) => script.id),
      );
      const nextScript: ProjectScript = {
        id: nextId,
        name: scriptInput.name,
        command: scriptInput.command,
        icon: scriptInput.icon,
        runOnWorktreeCreate: scriptInput.runOnWorktreeCreate,
      };
      const nextScripts = scriptInput.runOnWorktreeCreate
        ? [
            ...input.activeProject.scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...input.activeProject.scripts, nextScript];

      await persistProjectScripts({
        projectId: input.activeProject.id,
        nextScripts,
        keybinding: scriptInput.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [input.activeProject, persistProjectScripts],
  );

  const updateProjectScript = useCallback(
    async (scriptId: string, scriptInput: NewProjectScriptInput) => {
      if (!input.activeProject) return;
      const existingScript = input.activeProject.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        throw new Error("Script not found.");
      }

      const updatedScript: ProjectScript = {
        ...existingScript,
        name: scriptInput.name,
        command: scriptInput.command,
        icon: scriptInput.icon,
        runOnWorktreeCreate: scriptInput.runOnWorktreeCreate,
      };
      const nextScripts = input.activeProject.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : scriptInput.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      await persistProjectScripts({
        projectId: input.activeProject.id,
        nextScripts,
        keybinding: scriptInput.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [input.activeProject, persistProjectScripts],
  );

  const deleteProjectScript = useCallback(
    async (scriptId: string) => {
      if (!input.activeProject) return;
      const nextScripts = input.activeProject.scripts.filter((script) => script.id !== scriptId);
      const deletedName = input.activeProject.scripts.find(
        (script) => script.id === scriptId,
      )?.name;

      try {
        await persistProjectScripts({
          projectId: input.activeProject.id,
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
    [input.activeProject, persistProjectScripts],
  );

  return {
    preferredScriptId: input.activeProject
      ? (lastInvokedScriptByProjectId[input.activeProject.id] ?? null)
      : null,
    runProjectScript,
    saveProjectScript,
    updateProjectScript,
    deleteProjectScript,
  };
}
