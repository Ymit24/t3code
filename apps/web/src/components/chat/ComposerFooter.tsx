import { BotIcon, ListTodoIcon, LockIcon, LockOpenIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { CodexTraitsPicker } from "./CodexTraitsPicker";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ComposerSendControls } from "./ComposerSendControls";
import { type ChatComposerController } from "./useChatComposerController";

interface ComposerFooterProps {
  controller: Pick<
    ChatComposerController,
    "actions" | "attachments" | "banner" | "controls" | "editor"
  >;
}

export function ComposerFooter({ controller }: ComposerFooterProps) {
  const { banner, controls } = controller;

  if (banner.activePendingApproval) {
    return (
      <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
        <ComposerPendingApprovalActions
          requestId={banner.activePendingApproval.requestId}
          isResponding={banner.respondingRequestIds.includes(banner.activePendingApproval.requestId)}
          onRespondToApproval={banner.onRespondToApproval}
        />
      </div>
    );
  }

  return (
    <div
      data-chat-composer-footer="true"
      className={cn(
        "flex items-center justify-between px-2.5 pb-2.5 sm:px-3 sm:pb-3",
        controls.isComposerFooterCompact ? "gap-1.5" : "flex-wrap gap-2 sm:flex-nowrap sm:gap-0",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center",
          controls.isComposerFooterCompact
            ? "gap-1 overflow-hidden"
            : "gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-max sm:overflow-visible",
        )}
      >
        <ProviderModelPicker
          compact={controls.isComposerFooterCompact}
          provider={controls.selectedProvider}
          model={controls.selectedModelForPickerWithCustomFallback}
          lockedProvider={controls.lockedProvider}
          modelOptionsByProvider={controls.modelOptionsByProvider}
          onProviderModelChange={controls.onProviderModelSelect}
        />

        {controls.isComposerFooterCompact ? (
          <CompactComposerControlsMenu
            activePlan={Boolean(controls.activePlan || controls.activeProposedPlan || controls.planSidebarOpen)}
            interactionMode={controls.interactionMode}
            planSidebarOpen={controls.planSidebarOpen}
            runtimeMode={controls.runtimeMode}
            selectedEffort={controls.selectedEffort}
            selectedProvider={controls.selectedProvider}
            selectedCodexFastModeEnabled={controls.selectedCodexFastModeEnabled}
            reasoningOptions={controls.reasoningOptions}
            onEffortSelect={controls.onEffortSelect}
            onCodexFastModeChange={controls.onCodexFastModeChange}
            onToggleInteractionMode={controls.toggleInteractionMode}
            onTogglePlanSidebar={controls.togglePlanSidebar}
            onToggleRuntimeMode={controls.toggleRuntimeMode}
          />
        ) : (
          <>
            {controls.selectedProvider === "codex" && controls.selectedEffort != null ? (
              <>
                <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                <CodexTraitsPicker
                  effort={controls.selectedEffort}
                  fastModeEnabled={controls.selectedCodexFastModeEnabled}
                  options={controls.reasoningOptions}
                  onEffortChange={controls.onEffortSelect}
                  onFastModeChange={controls.onCodexFastModeChange}
                />
              </>
            ) : null}

            <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

            <Button
              variant="ghost"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              size="sm"
              type="button"
              onClick={controls.toggleInteractionMode}
              title={
                controls.interactionMode === "plan"
                  ? "Plan mode — click to return to normal chat mode"
                  : "Default mode — click to enter plan mode"
              }
            >
              <BotIcon />
              <span className="sr-only sm:not-sr-only">
                {controls.interactionMode === "plan" ? "Plan" : "Chat"}
              </span>
            </Button>

            <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

            <Button
              variant="ghost"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              size="sm"
              type="button"
              onClick={controls.toggleRuntimeMode}
              title={
                controls.runtimeMode === "full-access"
                  ? "Full access — click to require approvals"
                  : "Approval required — click for full access"
              }
            >
              {controls.runtimeMode === "full-access" ? <LockOpenIcon /> : <LockIcon />}
              <span className="sr-only sm:not-sr-only">
                {controls.runtimeMode === "full-access" ? "Full access" : "Supervised"}
              </span>
            </Button>

            {controls.activePlan || controls.activeProposedPlan || controls.planSidebarOpen ? (
              <>
                <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                <Button
                  variant="ghost"
                  className={cn(
                    "shrink-0 whitespace-nowrap px-2 sm:px-3",
                    controls.planSidebarOpen
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-muted-foreground/70 hover:text-foreground/80",
                  )}
                  size="sm"
                  type="button"
                  onClick={controls.togglePlanSidebar}
                  title={controls.planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
                >
                  <ListTodoIcon />
                  <span className="sr-only sm:not-sr-only">Plan</span>
                </Button>
              </>
            ) : null}
          </>
        )}
      </div>

      <ComposerSendControls controller={controller} />
    </div>
  );
}
