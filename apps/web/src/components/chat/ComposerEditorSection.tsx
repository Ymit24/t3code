import { cn } from "~/lib/utils";
import { ComposerPromptEditor } from "../ComposerPromptEditor";
import { ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerAttachmentTray } from "./ComposerAttachmentTray";
import { type ChatComposerController } from "./useChatComposerController";

interface ComposerEditorSectionProps {
  attachments: ChatComposerController["attachments"];
  editor: ChatComposerController["editor"];
  menu: ChatComposerController["menu"];
}

export function ComposerEditorSection({
  attachments,
  editor,
  menu,
}: ComposerEditorSectionProps) {
  return (
    <div
      className={cn(
        "relative px-3 pb-2 sm:px-4",
        editor.hasComposerHeader ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-4",
      )}
    >
      {menu.open && !editor.isComposerApprovalState ? (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
          <ComposerCommandMenu
            items={menu.composerMenuItems}
            resolvedTheme={menu.resolvedTheme ?? "light"}
            isLoading={menu.isComposerMenuLoading}
            triggerKind={menu.composerTriggerKind}
            activeItemId={menu.activeComposerMenuItem?.id ?? null}
            onHighlightedItemChange={menu.onComposerMenuItemHighlighted}
            onSelect={menu.onSelectComposerItem}
          />
        </div>
      ) : null}

      {editor.showAttachmentTray && attachments.images.length > 0 ? (
        <ComposerAttachmentTray attachments={attachments} />
      ) : null}

      <ComposerPromptEditor
        ref={editor.composerEditorRef}
        value={editor.value}
        cursor={editor.composerCursor}
        onChange={editor.onPromptChange}
        onCommandKeyDown={editor.onCommandKey}
        onPaste={editor.onPaste}
        placeholder={editor.placeholder}
        disabled={editor.disabled}
      />
    </div>
  );
}
