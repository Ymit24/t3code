import { BotIcon, ListTodoIcon, LockIcon, LockOpenIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { CodexTraitsPicker } from "./CodexTraitsPicker";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { cn } from "~/lib/utils";

export default function ChatComposerFooter() {
  return (
    <>
      {
        isComposerFooterCompact ? (
          <CompactComposerControlsMenu
            activePlan={Boolean(activePlan || activeProposedPlan || planSidebarOpen)
            }
            interactionMode={interactionMode}
            planSidebarOpen={planSidebarOpen}
            runtimeMode={runtimeMode}
            selectedEffort={selectedEffort}
            selectedProvider={selectedProvider}
            selectedCodexFastModeEnabled={selectedCodexFastModeEnabled}
            reasoningOptions={reasoningOptions}
            onEffortSelect={onEffortSelect}
            onCodexFastModeChange={onCodexFastModeChange}
            onToggleInteractionMode={toggleInteractionMode}
            onTogglePlanSidebar={togglePlanSidebar}
            onToggleRuntimeMode={toggleRuntimeMode}
          />
        ) : (
          <>
            {selectedProvider === "codex" && selectedEffort != null ? (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-0.5 hidden h-4 sm:block"
                />
                <CodexTraitsPicker
                  effort={selectedEffort}
                  fastModeEnabled={selectedCodexFastModeEnabled}
                  options={reasoningOptions}
                  onEffortChange={onEffortSelect}
                  onFastModeChange={onCodexFastModeChange}
                />
              </>
            ) : null}

            <Separator
              orientation="vertical"
              className="mx-0.5 hidden h-4 sm:block"
            />

            <Button
              variant="ghost"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              size="sm"
              type="button"
              onClick={toggleInteractionMode}
              title={
                interactionMode === "plan"
                  ? "Plan mode — click to return to normal chat mode"
                  : "Default mode — click to enter plan mode"
              }
            >
              <BotIcon />
              <span className="sr-only sm:not-sr-only">
                {interactionMode === "plan" ? "Plan" : "Chat"}
              </span>
            </Button>

            <Separator
              orientation="vertical"
              className="mx-0.5 hidden h-4 sm:block"
            />

            <Button
              variant="ghost"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
              size="sm"
              type="button"
              onClick={() =>
                void handleRuntimeModeChange(
                  runtimeMode === "full-access" ? "approval-required" : "full-access",
                )
              }
              title={
                runtimeMode === "full-access"
                  ? "Full access — click to require approvals"
                  : "Approval required — click for full access"
              }
            >
              {runtimeMode === "full-access" ? <LockOpenIcon /> : <LockIcon />}
              <span className="sr-only sm:not-sr-only">
                {runtimeMode === "full-access" ? "Full access" : "Supervised"}
              </span>
            </Button>

            {activePlan || activeProposedPlan || planSidebarOpen ? (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-0.5 hidden h-4 sm:block"
                />
                <Button
                  variant="ghost"
                  className={cn(
                    "shrink-0 whitespace-nowrap px-2 sm:px-3",
                    planSidebarOpen
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-muted-foreground/70 hover:text-foreground/80",
                  )}
                  size="sm"
                  type="button"
                  onClick={togglePlanSidebar}
                  title={planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
                >
                  <ListTodoIcon />
                  <span className="sr-only sm:not-sr-only">Plan</span>
                </Button>
              </>
            ) : null}
          </>
        )
      }
    </>
  )
}
