import { cn } from "~/lib/utils";
import ChatSendButton from "./ChatSendButton";
import ChatComposerFooter from "./ChatThing";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ProviderModelPicker } from "./ProviderModelPicker";

export default function ChatBottomToolbar() {
  return (
    <>
      {
        activePendingApproval ? (
          <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3" >
            <ComposerPendingApprovalActions
              requestId={activePendingApproval.requestId}
              isResponding={respondingRequestIds.includes(activePendingApproval.requestId)}
              onRespondToApproval={onRespondToApproval}
            />
          </div>
        ) : (
          <div
            data-chat-composer-footer="true"
            className={cn(
              "flex items-center justify-between px-2.5 pb-2.5 sm:px-3 sm:pb-3",
              isComposerFooterCompact
                ? "gap-1.5"
                : "flex-wrap gap-2 sm:flex-nowrap sm:gap-0",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center",
                isComposerFooterCompact
                  ? "gap-1 overflow-hidden"
                  : "gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-max sm:overflow-visible",
              )}
            >
              {/* Provider/model picker */}
              <ProviderModelPicker
                compact={isComposerFooterCompact}
                provider={selectedProvider}
                model={selectedModelForPickerWithCustomFallback}
                lockedProvider={lockedProvider}
                modelOptionsByProvider={modelOptionsByProvider}
                onProviderModelChange={onProviderModelSelect}
              />

              <ChatComposerFooter />
            </div>

            {/* Right side: send / stop button */}
            <ChatSendButton />
          </div>
        )
      }
    </>
  );
}
