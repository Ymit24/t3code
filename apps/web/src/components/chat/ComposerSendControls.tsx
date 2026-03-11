import { ChevronDownIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { type ChatComposerController } from "./useChatComposerController";

interface ComposerSendControlsProps {
  actions: ChatComposerController["actions"];
  attachments: ChatComposerController["attachments"];
  banner: ChatComposerController["banner"];
  editor: ChatComposerController["editor"];
}

export function ComposerSendControls({
  actions,
  attachments,
  banner,
  editor,
}: ComposerSendControlsProps) {
  return (
    <div data-chat-composer-actions="right" className="flex shrink-0 items-center gap-2">
      {actions.isPreparingWorktree ? (
        <span className="text-muted-foreground/70 text-xs">Preparing worktree...</span>
      ) : null}
      {banner.activePendingProgress ? (
        <div className="flex items-center gap-2">
          {banner.activePendingProgress.questionIndex > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={banner.onPreviousActivePendingUserInputQuestion}
              disabled={banner.activePendingIsResponding}
            >
              Previous
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="rounded-full px-4"
            disabled={
              banner.activePendingIsResponding ||
              (banner.activePendingProgress.isLastQuestion
                ? !banner.activePendingResolvedAnswers
                : !banner.activePendingProgress.canAdvance)
            }
          >
            {banner.activePendingIsResponding
              ? "Submitting..."
              : banner.activePendingProgress.isLastQuestion
                ? "Submit answers"
                : "Next question"}
          </Button>
        </div>
      ) : actions.phase === "running" ? (
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 sm:h-8 sm:w-8"
          onClick={() => void actions.onInterrupt()}
          aria-label="Stop generation"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="8" height="8" rx="1.5" />
          </svg>
        </button>
      ) : banner.showPlanFollowUpPrompt ? (
        editor.value.trim().length > 0 ? (
          <Button
            type="submit"
            size="sm"
            className="h-9 rounded-full px-4 sm:h-8"
            disabled={actions.isSendBusy || actions.isConnecting}
          >
            {actions.isConnecting || actions.isSendBusy ? "Sending..." : "Refine"}
          </Button>
        ) : (
          <div className="flex items-center">
            <Button
              type="submit"
              size="sm"
              className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
              disabled={actions.isSendBusy || actions.isConnecting}
            >
              {actions.isConnecting || actions.isSendBusy ? "Sending..." : "Implement"}
            </Button>
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="default"
                    className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                    aria-label="Implementation actions"
                    disabled={actions.isSendBusy || actions.isConnecting}
                  />
                }
              >
                <ChevronDownIcon className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" side="top">
                <MenuItem
                  disabled={actions.isSendBusy || actions.isConnecting}
                  onClick={() => void actions.onImplementPlanInNewThread()}
                >
                  Implement in new thread
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        )
      ) : (
        <button
          type="submit"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-all duration-150 hover:bg-primary hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 sm:h-8 sm:w-8"
          disabled={
            actions.isSendBusy ||
            actions.isConnecting ||
            (!editor.value.trim() && attachments.images.length === 0)
          }
          aria-label={
            actions.isConnecting
              ? "Connecting"
              : actions.isPreparingWorktree
                ? "Preparing worktree"
                : actions.isSendBusy
                  ? "Sending"
                  : "Send message"
          }
        >
          {actions.isConnecting || actions.isSendBusy ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="animate-spin"
              aria-hidden="true"
            >
              <circle
                cx="7"
                cy="7"
                r="5.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="20 12"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
