import { cn } from "~/lib/utils";
import { proposedPlanTitle } from "~/proposedPlan";
import { ComposerPromptEditor } from "../ComposerPromptEditor";
import ChatBottomToolbar from "./ChatBottomToolbar";
import ChatComposerImages from "./ChatComposerImages";
import { ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";

export default function ChatInputBar() {
  return (

    <div className={cn("px-3 pt-1.5 sm:px-5 sm:pt-2", isGitRepo ? "pb-1" : "pb-3 sm:pb-4")}>
      <form
        ref={composerFormRef}
        onSubmit={onSend}
        className="mx-auto w-full min-w-0 max-w-3xl"
        data-chat-composer-form="true"
      >
        <div
          className={`group rounded-[20px] border bg-card transition-colors duration-200 focus-within:border-ring/45 ${isDragOverComposer ? "border-primary/70 bg-accent/30" : "border-border"
            }`}
          onDragEnter={onComposerDragEnter}
          onDragOver={onComposerDragOver}
          onDragLeave={onComposerDragLeave}
          onDrop={onComposerDrop}
        >
          {activePendingApproval ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingApprovalPanel
                approval={activePendingApproval}
                pendingCount={pendingApprovals.length}
              />
            </div>
          ) : pendingUserInputs.length > 0 ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingUserInputPanel
                pendingUserInputs={pendingUserInputs}
                respondingRequestIds={respondingUserInputRequestIds}
                answers={activePendingDraftAnswers}
                questionIndex={activePendingQuestionIndex}
                onSelectOption={onSelectActivePendingUserInputOption}
                onAdvance={onAdvanceActivePendingUserInput}
              />
            </div>
          ) : showPlanFollowUpPrompt && activeProposedPlan ? (
            <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPlanFollowUpBanner
                key={activeProposedPlan.id}
                planTitle={proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null}
              />
            </div>
          ) : null}

          {/* Textarea area */}
          <div
            className={cn(
              "relative px-3 pb-2 sm:px-4",
              hasComposerHeader ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-4",
            )}
          >
            {composerMenuOpen && !isComposerApprovalState && (
              <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
                <ComposerCommandMenu
                  items={composerMenuItems}
                  resolvedTheme={resolvedTheme}
                  isLoading={isComposerMenuLoading}
                  triggerKind={composerTriggerKind}
                  activeItemId={activeComposerMenuItem?.id ?? null}
                  onHighlightedItemChange={onComposerMenuItemHighlighted}
                  onSelect={onSelectComposerItem}
                />
              </div>
            )}

            {!isComposerApprovalState &&
              pendingUserInputs.length === 0 &&
              composerImages.length > 0 && (
                <ChatComposerImages />
              )}
            <ComposerPromptEditor
              ref={composerEditorRef}
              value={
                isComposerApprovalState
                  ? ""
                  : activePendingProgress
                    ? activePendingProgress.customAnswer
                    : prompt
              }
              cursor={composerCursor}
              onChange={onPromptChange}
              onCommandKeyDown={onComposerCommandKey}
              onPaste={onComposerPaste}
              placeholder={
                isComposerApprovalState
                  ? (activePendingApproval?.detail ??
                    "Resolve this approval request to continue")
                  : activePendingProgress
                    ? "Type your own answer, or leave this blank to use the selected option"
                    : showPlanFollowUpPrompt && activeProposedPlan
                      ? "Add feedback to refine the plan, or leave this blank to implement it"
                      : phase === "disconnected"
                        ? "Ask for follow-up changes or attach images"
                        : "Ask anything, @tag files/folders, or use / to show available commands"
              }
              disabled={isConnecting || isComposerApprovalState}
            />
          </div>

          {/* Bottom toolbar */}
          <ChatBottomToolbar />
        </div>
      </form>
    </div>
  )
}
