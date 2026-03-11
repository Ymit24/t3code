import { type ModelSlug, type ProviderKind, type ThreadId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ComposerTrigger,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  replaceTextRange,
} from "../../composer-logic";
import { derivePendingUserInputProgress } from "../../pendingUserInput";
import { projectSearchEntriesQueryOptions } from "../../lib/projectReactQuery";
import { basenameOfPath } from "../../vscode-icons";
import { type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { type ComposerCommandItem } from "./ComposerCommandMenu";

const EMPTY_PROJECT_ENTRIES = [] as {
  kind: "directory" | "file";
  parentPath: string | null;
  path: string;
}[];
const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;

type PendingProgress = ReturnType<typeof derivePendingUserInputProgress>;

interface SearchableModelOption {
  name: string;
  provider: ProviderKind;
  providerLabel: string;
  searchName: string;
  searchProvider: string;
  searchSlug: string;
  slug: ModelSlug;
}

interface UseComposerMenuStateArgs {
  activePendingProgress: PendingProgress | null;
  activePendingUserInputRequestId: string | null;
  composerEditorRef: MutableRefObject<ComposerPromptEditorHandle | null>;
  gitCwd: string | null;
  onSendRef: MutableRefObject<(() => Promise<void>) | null>;
  onToggleInteractionMode: () => void;
  onUpdateInteractionMode: (mode: "default" | "plan") => void | Promise<void>;
  onUpdatePendingCustomAnswer: (questionId: string, value: string) => void;
  onUpdateProviderModel: (provider: ProviderKind, model: ModelSlug) => void;
  prompt: string;
  promptRef: MutableRefObject<string>;
  resolvedTheme: "light" | "dark" | undefined;
  searchableModelOptions: SearchableModelOption[];
  setPrompt: (nextPrompt: string) => void;
  threadId: ThreadId;
}

export function useComposerMenuState({
  activePendingProgress,
  activePendingUserInputRequestId,
  composerEditorRef,
  gitCwd,
  onSendRef,
  onToggleInteractionMode,
  onUpdateInteractionMode,
  onUpdatePendingCustomAnswer,
  onUpdateProviderModel,
  prompt,
  promptRef,
  resolvedTheme,
  searchableModelOptions,
  setPrompt,
  threadId,
}: UseComposerMenuStateArgs) {
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  const [composerCursor, setComposerCursor] = useState(() => prompt.length);
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(() =>
    detectComposerTrigger(prompt, prompt.length),
  );
  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);

  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const composerTriggerKind = composerTrigger?.kind ?? null;
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
      enabled: isPathTrigger,
      limit: 80,
      query: effectivePathQuery,
    }),
  );
  const workspaceEntries = workspaceEntriesQuery.data?.entries ?? EMPTY_PROJECT_ENTRIES;
  const composerMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      return workspaceEntries.map((entry) => ({
        description: entry.parentPath ?? "",
        id: `path:${entry.kind}:${entry.path}`,
        label: basenameOfPath(entry.path),
        path: entry.path,
        pathKind: entry.kind,
        type: "path",
      }));
    }

    if (composerTrigger.kind === "slash-command") {
      const slashCommandItems = [
        {
          command: "model",
          description: "Switch response model for this thread",
          id: "slash:model",
          label: "/model",
          type: "slash-command",
        },
        {
          command: "plan",
          description: "Switch this thread into plan mode",
          id: "slash:plan",
          label: "/plan",
          type: "slash-command",
        },
        {
          command: "default",
          description: "Switch this thread back to normal chat mode",
          id: "slash:default",
          label: "/default",
          type: "slash-command",
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
        description: `${providerLabel} · ${slug}`,
        id: `model:${provider}:${slug}`,
        label: name,
        model: slug,
        provider,
        type: "model",
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

  useEffect(() => {
    if (!activePendingProgress) {
      return;
    }
    promptRef.current = activePendingProgress.customAnswer;
    setComposerCursor(activePendingProgress.customAnswer.length);
    setComposerTrigger(
      detectComposerTrigger(
        activePendingProgress.customAnswer,
        expandCollapsedComposerCursor(
          activePendingProgress.customAnswer,
          activePendingProgress.customAnswer.length,
        ),
      ),
    );
    setComposerHighlightedItemId(null);
  }, [activePendingProgress, activePendingUserInputRequestId, promptRef]);

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
  }, [composerMenuItems, composerMenuOpen]);

  useEffect(() => {
    setComposerCursor((existing) => Math.min(Math.max(0, existing), prompt.length));
  }, [prompt]);

  useEffect(() => {
    setComposerHighlightedItemId(null);
    setComposerCursor(promptRef.current.length);
    setComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
  }, [promptRef, threadId]);

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
      promptRef.current = next.text;
      const activePendingQuestion = activePendingProgress?.activeQuestion;
      if (activePendingQuestion && activePendingUserInputRequestId) {
        onUpdatePendingCustomAnswer(activePendingQuestion.id, next.text);
      } else {
        setPrompt(next.text);
      }
      setComposerCursor(next.cursor);
      setComposerTrigger(detectComposerTrigger(next.text, next.cursor));
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAt(next.cursor);
      });
      return true;
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInputRequestId,
      composerEditorRef,
      onUpdatePendingCustomAnswer,
      promptRef,
      setPrompt,
    ],
  );

  const readComposerSnapshot = useCallback((): { cursor: number; value: string } => {
    const editorSnapshot = composerEditorRef.current?.readSnapshot();
    if (editorSnapshot) {
      return editorSnapshot;
    }
    return { cursor: composerCursor, value: promptRef.current };
  }, [composerCursor, composerEditorRef, promptRef]);

  const resolveActiveComposerTrigger = useCallback(() => {
    const snapshot = readComposerSnapshot();
    const expandedCursor = expandCollapsedComposerCursor(snapshot.value, snapshot.cursor);
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, expandedCursor),
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
      const expectedToken = snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd);
      if (item.type === "path") {
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          trigger.rangeEnd,
          `@${item.path} `,
          { expectedText: expectedToken },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "slash-command") {
        if (item.command === "model") {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "/model ", {
            expectedText: expectedToken,
          });
          if (applied) {
            setComposerHighlightedItemId(null);
          }
          return;
        }
        void onUpdateInteractionMode(item.command === "plan" ? "plan" : "default");
        const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: expectedToken,
        });
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      onUpdateProviderModel(item.provider, item.model);
      const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
        expectedText: expectedToken,
      });
      if (applied) {
        setComposerHighlightedItemId(null);
      }
    },
    [
      applyPromptReplacement,
      onUpdateInteractionMode,
      onUpdateProviderModel,
      resolveActiveComposerTrigger,
    ],
  );

  const onComposerMenuItemHighlighted = useCallback((itemId: string | null) => {
    setComposerHighlightedItemId(itemId);
  }, []);

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
    [composerHighlightedItemId, composerMenuItems],
  );

  const onPromptChange = useCallback(
    (nextPrompt: string, nextCursor: number, cursorAdjacentToMention: boolean) => {
      if (activePendingProgress?.activeQuestion && activePendingUserInputRequestId) {
        promptRef.current = nextPrompt;
        onUpdatePendingCustomAnswer(activePendingProgress.activeQuestion.id, nextPrompt);
        setComposerCursor(nextCursor);
        setComposerTrigger(
          cursorAdjacentToMention
            ? null
            : detectComposerTrigger(nextPrompt, expandCollapsedComposerCursor(nextPrompt, nextCursor)),
        );
        return;
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention
          ? null
          : detectComposerTrigger(nextPrompt, expandCollapsedComposerCursor(nextPrompt, nextCursor)),
      );
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInputRequestId,
      onUpdatePendingCustomAnswer,
      promptRef,
      setPrompt,
    ],
  );

  const onComposerCommandKey = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent) => {
      if (key === "Tab" && event.shiftKey) {
        onToggleInteractionMode();
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
        void onSendRef.current?.();
        return true;
      }
      return false;
    },
    [
      nudgeComposerMenuHighlight,
      onSelectComposerItem,
      onSendRef,
      onToggleInteractionMode,
      resolveActiveComposerTrigger,
    ],
  );

  const isComposerMenuLoading =
    composerTriggerKind === "path" &&
    ((pathTriggerQuery.length > 0 && composerPathQueryDebouncer.state.isPending) ||
      workspaceEntriesQuery.isLoading ||
      workspaceEntriesQuery.isFetching);

  return {
    editorState: {
      composerCursor,
      onComposerCommandKey,
      onPromptChange,
    },
    internalSetters: {
      setComposerCursor,
      setComposerHighlightedItemId,
      setComposerTrigger,
    },
    menuState: {
      activeComposerMenuItem,
      composerMenuItems,
      composerTriggerKind,
      isComposerMenuLoading,
      onComposerMenuItemHighlighted,
      onSelectComposerItem,
      open: composerMenuOpen,
      resolvedTheme,
    },
  };
}
