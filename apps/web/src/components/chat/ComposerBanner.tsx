import { proposedPlanTitle } from "../../proposedPlan";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import { type ChatComposerBannerSection } from "./useChatComposerController";

interface ComposerBannerProps {
  banner: ChatComposerBannerSection;
}

export function ComposerBanner({ banner }: ComposerBannerProps) {
  if (banner.activePendingApproval) {
    return (
      <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
        <ComposerPendingApprovalPanel
          approval={banner.activePendingApproval}
          pendingCount={banner.pendingApprovals.length}
        />
      </div>
    );
  }

  if (banner.pendingUserInputs.length > 0) {
    return (
      <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
        <ComposerPendingUserInputPanel
          pendingUserInputs={banner.pendingUserInputs}
          respondingRequestIds={banner.respondingUserInputRequestIds}
          answers={banner.activePendingDraftAnswers}
          questionIndex={banner.activePendingQuestionIndex}
          onSelectOption={banner.onSelectActivePendingUserInputOption}
          onAdvance={banner.onAdvanceActivePendingUserInput}
        />
      </div>
    );
  }

  if (banner.showPlanFollowUpPrompt && banner.activeProposedPlan) {
    return (
      <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
        <ComposerPlanFollowUpBanner
          key={banner.activeProposedPlan.id}
          planTitle={proposedPlanTitle(banner.activeProposedPlan.planMarkdown) ?? null}
        />
      </div>
    );
  }

  return null;
}
