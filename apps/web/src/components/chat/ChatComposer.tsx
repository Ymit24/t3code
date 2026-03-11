import { cn } from "~/lib/utils";

import { ComposerBanner } from "./ComposerBanner";
import { ComposerEditorSection } from "./ComposerEditorSection";
import { ComposerFooter } from "./ComposerFooter";
import { type ChatComposerController } from "./useChatComposerController";

interface ChatComposerProps {
  controller: ChatComposerController;
  isGitRepo: boolean;
}

export function ChatComposer({ controller, isGitRepo }: ChatComposerProps) {
  const { actions, attachments, editor } = controller;

  return (
    <div
      className={cn(
        "px-3 pt-1.5 sm:px-5 sm:pt-2",
        isGitRepo ? "pb-1" : "pb-3 sm:pb-4",
      )}
    >
      <form
        ref={editor.composerFormRef}
        onSubmit={actions.onSend}
        className="mx-auto w-full min-w-0 max-w-3xl"
        data-chat-composer-form="true"
      >
        <div
          className={cn(
            "group rounded-[20px] border bg-card transition-colors duration-200 focus-within:border-ring/45",
            attachments.isDragOverComposer
              ? "border-primary/70 bg-accent/30"
              : "border-border",
          )}
          onDragEnter={attachments.onDragEnter}
          onDragOver={attachments.onDragOver}
          onDragLeave={attachments.onDragLeave}
          onDrop={attachments.onDrop}
        >
          <ComposerBanner controller={controller} />
          <ComposerEditorSection controller={controller} />
          <ComposerFooter controller={controller} />
        </div>
      </form>
    </div>
  );
}
