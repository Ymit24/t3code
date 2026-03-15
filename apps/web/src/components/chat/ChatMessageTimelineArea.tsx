import { MessagesTimeline } from "./MessagesTimeline";

export function ChatMessageTimelineArea() {
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
        key={activeThread.id}
        activeThread={activeThread}
        hasMessages={timelineEntries.length > 0}
        scrollContainer={messagesScrollElement}
      />
    </div>
  )
}
