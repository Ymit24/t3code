import type { ProjectScript, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useEffect } from "react";
import { resolveShortcutCommand } from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { projectScriptIdFromCommand } from "~/projectScripts";
import type { Project } from "../types";
import type { ThreadTerminalState } from "../terminalStateStore";

interface UseChatKeyboardShortcutsInput {
  keybindings: ResolvedKeybindingsConfig;
  activeProject: Project | null;
  terminalState: ThreadTerminalState;
  toggleTerminalVisibility: () => void;
  splitTerminal: () => void;
  createNewTerminal: () => void;
  closeTerminal: (terminalId: string) => void;
  setTerminalOpen: (open: boolean) => void;
  onToggleDiff: () => void;
  runProjectScript: (script: ProjectScript) => Promise<void> | void;
}

export function useChatKeyboardShortcuts(input: UseChatKeyboardShortcutsInput): void {
  const {
    activeProject,
    closeTerminal,
    createNewTerminal,
    keybindings,
    onToggleDiff,
    runProjectScript,
    setTerminalOpen,
    splitTerminal,
    terminalState,
    toggleTerminalVisibility,
  } = input;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: Boolean(terminalState.terminalOpen),
        },
      });
      if (!command) return;

      if (command === "terminal.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleTerminalVisibility();
        return;
      }

      if (command === "terminal.split") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        splitTerminal();
        return;
      }

      if (command === "terminal.close") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) return;
        closeTerminal(terminalState.activeTerminalId);
        return;
      }

      if (command === "terminal.new") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        createNewTerminal();
        return;
      }

      if (command === "diff.toggle") {
        event.preventDefault();
        event.stopPropagation();
        onToggleDiff();
        return;
      }

      const scriptId = projectScriptIdFromCommand(command);
      if (!scriptId || !activeProject) return;
      const script = activeProject.scripts.find((entry) => entry.id === scriptId);
      if (!script) return;
      event.preventDefault();
      event.stopPropagation();
      void runProjectScript(script);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeProject,
    closeTerminal,
    createNewTerminal,
    keybindings,
    onToggleDiff,
    runProjectScript,
    setTerminalOpen,
    splitTerminal,
    terminalState.activeTerminalId,
    terminalState.terminalOpen,
    toggleTerminalVisibility,
  ]);
}
