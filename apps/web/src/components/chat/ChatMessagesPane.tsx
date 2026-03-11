import { MessagesTimeline } from "./MessagesTimeline";
import { type useChatMessagesPaneController } from "./useChatMessagesPaneController";

interface ChatMessagesPaneProps {
  controller: ReturnType<typeof useChatMessagesPaneController>;
  threadId: string;
}

export function ChatMessagesPane({ controller, threadId }: ChatMessagesPaneProps) {
  const {
    activeWorkStartedAt,
    completionDividerBeforeEntryId,
    completionSummary,
    isWorking,
    latestTurnSettled,
    onExpandTimelineImage,
    onMessagesClickCapture,
    onMessagesPointerCancel,
    onMessagesPointerDown,
    onMessagesPointerUp,
    onMessagesScroll,
    onMessagesTouchEnd,
    onMessagesTouchMove,
    onMessagesTouchStart,
    onMessagesWheel,
    onOpenTurnDiff,
    onRevertUserMessage,
    onToggleWorkGroup,
    setMessagesScrollContainerRef,
    timelineProps,
  } = controller;

  return (
    <div
      ref={setMessagesScrollContainerRef}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
      onScroll={onMessagesScroll}
      onClickCapture={onMessagesClickCapture}
      onWheel={onMessagesWheel}
      onPointerDown={onMessagesPointerDown}
      onPointerUp={onMessagesPointerUp}
      onPointerCancel={onMessagesPointerCancel}
      onTouchStart={onMessagesTouchStart}
      onTouchMove={onMessagesTouchMove}
      onTouchEnd={onMessagesTouchEnd}
      onTouchCancel={onMessagesTouchEnd}
    >
      <MessagesTimeline
        key={threadId}
        hasMessages={timelineProps.hasMessages}
        isWorking={isWorking}
        activeTurnInProgress={isWorking || !latestTurnSettled}
        activeTurnStartedAt={activeWorkStartedAt}
        scrollContainer={timelineProps.scrollContainer}
        timelineEntries={timelineProps.timelineEntries}
        completionDividerBeforeEntryId={completionDividerBeforeEntryId}
        completionSummary={completionSummary}
        turnDiffSummaryByAssistantMessageId={timelineProps.turnDiffSummaryByAssistantMessageId}
        nowIso={timelineProps.nowIso}
        expandedWorkGroups={timelineProps.expandedWorkGroups}
        onToggleWorkGroup={onToggleWorkGroup}
        onOpenTurnDiff={onOpenTurnDiff}
        revertTurnCountByUserMessageId={timelineProps.revertTurnCountByUserMessageId}
        onRevertUserMessage={onRevertUserMessage}
        isRevertingCheckpoint={timelineProps.isRevertingCheckpoint}
        onImageExpand={onExpandTimelineImage}
        markdownCwd={timelineProps.markdownCwd}
        resolvedTheme={timelineProps.resolvedTheme ?? "light"}
        workspaceRoot={timelineProps.workspaceRoot}
      />
    </div>
  );
}
