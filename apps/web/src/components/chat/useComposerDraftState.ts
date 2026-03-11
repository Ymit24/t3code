import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";
import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type ComposerImageAttachment,
  type DraftThreadEnvMode,
  type PersistedComposerImageAttachment,
  useComposerDraftStore,
  useComposerThreadDraft,
} from "../../composerDraftStore";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "../../types";
import { readFileAsDataUrl } from "../ChatView.logic";
import { shouldUseCompactComposerFooter } from "../composerFooterLayout";
import { type ComposerPromptEditorHandle } from "../ComposerPromptEditor";

const IMAGE_SIZE_LIMIT_LABEL = `${Math.round(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;

interface UseComposerDraftStateArgs {
  activeThread: Thread;
  composerFooterHasWideActions: boolean;
  isLocalDraftThread: boolean;
  setThreadError: (targetThreadId: ThreadId | null, error: string | null) => void;
  stickToBottomIfNeeded: () => void;
  threadId: ThreadId;
}

export function useComposerDraftState({
  activeThread,
  composerFooterHasWideActions,
  isLocalDraftThread,
  setThreadError,
  stickToBottomIfNeeded,
  threadId,
}: UseComposerDraftStateArgs) {
  const composerDraft = useComposerThreadDraft(threadId);
  const draftThread = useComposerDraftStore((store) => store.draftThreadsByThreadId[threadId] ?? null);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore((store) => store.setInteractionMode);
  const addComposerDraftImage = useComposerDraftStore((store) => store.addImage);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);

  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [isComposerFooterCompact, setIsComposerFooterCompact] = useState(false);
  const promptRef = useRef(composerDraft.prompt);
  const composerEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerFormHeightRef = useRef(0);
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const dragDepthRef = useRef(0);

  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(threadId, nextPrompt);
    },
    [setComposerDraftPrompt, threadId],
  );
  const addComposerImage = useCallback(
    (image: ComposerImageAttachment) => {
      addComposerDraftImage(threadId, image);
    },
    [addComposerDraftImage, threadId],
  );
  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => {
      addComposerDraftImages(threadId, images);
    },
    [addComposerDraftImages, threadId],
  );
  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      removeComposerDraftImage(threadId, imageId);
    },
    [removeComposerDraftImage, threadId],
  );

  const runtimeMode = composerDraft.runtimeMode ?? activeThread.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const interactionMode =
    composerDraft.interactionMode ?? activeThread.interactionMode ?? DEFAULT_INTERACTION_MODE;
  const envMode: DraftThreadEnvMode = activeThread.worktreePath
    ? "worktree"
    : isLocalDraftThread
      ? (draftThread?.envMode ?? "local")
      : "local";
  const envLocked = Boolean(
    activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "closed"),
  );

  const focusComposer = useCallback(() => {
    composerEditorRef.current?.focusAtEnd();
  }, []);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);

  const handleRuntimeModeChange = useCallback(
    (mode: RuntimeMode) => {
      if (mode === runtimeMode) return;
      setComposerDraftRuntimeMode(threadId, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { runtimeMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      isLocalDraftThread,
      runtimeMode,
      scheduleComposerFocus,
      setComposerDraftRuntimeMode,
      setDraftThreadContext,
      threadId,
    ],
  );
  const handleInteractionModeChange = useCallback(
    (mode: ProviderInteractionMode) => {
      if (mode === interactionMode) return;
      setComposerDraftInteractionMode(threadId, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { interactionMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      interactionMode,
      isLocalDraftThread,
      scheduleComposerFocus,
      setComposerDraftInteractionMode,
      setDraftThreadContext,
      threadId,
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
  const onEnvModeChange = useCallback(
    (mode: DraftThreadEnvMode) => {
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { envMode: mode });
      }
      scheduleComposerFocus();
    },
    [isLocalDraftThread, scheduleComposerFocus, setDraftThreadContext, threadId],
  );

  useLayoutEffect(() => {
    const composerForm = composerFormRef.current;
    if (!composerForm) return;
    const measureComposerFormWidth = () => composerForm.clientWidth;

    composerFormHeightRef.current = composerForm.getBoundingClientRect().height;
    setIsComposerFooterCompact(
      shouldUseCompactComposerFooter(measureComposerFormWidth(), {
        hasWideActions: composerFooterHasWideActions,
      }),
    );
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;

      const nextCompact = shouldUseCompactComposerFooter(measureComposerFormWidth(), {
        hasWideActions: composerFooterHasWideActions,
      });
      setIsComposerFooterCompact((previous) => (previous === nextCompact ? previous : nextCompact));

      const nextHeight = entry.contentRect.height;
      const previousHeight = composerFormHeightRef.current;
      composerFormHeightRef.current = nextHeight;

      if (previousHeight > 0 && Math.abs(nextHeight - previousHeight) < 0.5) return;
      stickToBottomIfNeeded();
    });

    observer.observe(composerForm);
    return () => {
      observer.disconnect();
    };
  }, [composerFooterHasWideActions, stickToBottomIfNeeded]);

  useEffect(() => {
    composerImagesRef.current = composerDraft.images;
  }, [composerDraft.images]);

  useEffect(() => {
    promptRef.current = composerDraft.prompt;
  }, [composerDraft.prompt]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (composerDraft.images.length === 0) {
        clearComposerDraftPersistedAttachments(threadId);
        return;
      }
      const getPersistedAttachmentsForThread = () =>
        useComposerDraftStore.getState().draftsByThreadId[threadId]?.persistedAttachments ?? [];
      try {
        const currentPersistedAttachments = getPersistedAttachmentsForThread();
        const existingPersistedById = new Map(
          currentPersistedAttachments.map((attachment) => [attachment.id, attachment]),
        );
        const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
        await Promise.all(
          composerDraft.images.map(async (image) => {
            try {
              const dataUrl = await readFileAsDataUrl(image.file);
              stagedAttachmentById.set(image.id, {
                dataUrl,
                id: image.id,
                mimeType: image.mimeType,
                name: image.name,
                sizeBytes: image.sizeBytes,
              });
            } catch {
              const existingPersisted = existingPersistedById.get(image.id);
              if (existingPersisted) {
                stagedAttachmentById.set(image.id, existingPersisted);
              }
            }
          }),
        );
        if (!cancelled) {
          syncComposerDraftPersistedAttachments(threadId, Array.from(stagedAttachmentById.values()));
        }
      } catch {
        const currentImageIds = new Set(composerDraft.images.map((image) => image.id));
        const fallbackPersistedAttachments = getPersistedAttachmentsForThread();
        const fallbackAttachments = fallbackPersistedAttachments.filter((attachment) =>
          currentImageIds.has(attachment.id),
        );
        if (!cancelled) {
          syncComposerDraftPersistedAttachments(threadId, fallbackAttachments);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    clearComposerDraftPersistedAttachments,
    composerDraft.images,
    syncComposerDraftPersistedAttachments,
    threadId,
  ]);

  const addComposerImages = useCallback(
    (files: File[]) => {
      if (!activeThread.id || files.length === 0) return;

      const nextImages: ComposerImageAttachment[] = [];
      let nextImageCount = composerImagesRef.current.length;
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

        nextImages.push({
          file,
          id: crypto.randomUUID(),
          mimeType: file.type,
          name: file.name || "image",
          previewUrl: URL.createObjectURL(file),
          sizeBytes: file.size,
          type: "image",
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
    [activeThread.id, addComposerImage, addComposerImagesToDraft, setThreadError],
  );

  const removeComposerImage = useCallback(
    (imageId: string) => {
      removeComposerImageFromDraft(imageId);
    },
    [removeComposerImageFromDraft],
  );

  const onComposerPaste = useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
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

  const onComposerDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverComposer(true);
  }, []);
  const onComposerDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOverComposer(true);
  }, []);
  const onComposerDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
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
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("Files")) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverComposer(false);
      addComposerImages(Array.from(event.dataTransfer.files));
      focusComposer();
    },
    [addComposerImages, focusComposer],
  );

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragOverComposer(false);
  }, []);

  return {
    attachments: {
      addComposerImages,
      isDragOverComposer,
      onComposerDragEnter,
      onComposerDragLeave,
      onComposerDragOver,
      onComposerDrop,
      onComposerPaste,
      removeComposerImage,
    },
    clearComposerDraftContent,
    controls: {
      handleInteractionModeChange,
      handleRuntimeModeChange,
      onEnvModeChange,
      toggleInteractionMode,
      toggleRuntimeMode,
    },
    draft: {
      codexFastMode: composerDraft.codexFastMode,
      effort: composerDraft.effort,
      envLocked,
      envMode,
      images: composerDraft.images,
      interactionMode,
      model: composerDraft.model,
      nonPersistedImageIds: composerDraft.nonPersistedImageIds,
      prompt: composerDraft.prompt,
      provider: composerDraft.provider,
      runtimeMode,
    },
    editorRefs: {
      composerEditorRef,
      composerFormRef,
      composerImagesRef,
      promptRef,
    },
    focus: {
      focusComposer,
      scheduleComposerFocus,
    },
    layout: {
      isComposerFooterCompact,
    },
    resetDragState,
    setDraftInteractionMode: setComposerDraftInteractionMode,
    setPrompt,
    stagedAttachments: {
      addComposerImagesToDraft,
    },
  };
}
