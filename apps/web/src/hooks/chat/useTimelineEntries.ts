import { useMemo } from "react";
import { useChatViewStore } from "~/components/ChatViewStoreProvider";
import { deriveTimelineEntries } from "~/session-logic";
import { Thread } from "~/types";

export default function useTimelineEntries(activeThread: Thread) {
  const optimisticUserMessages = useChatViewStore((store) => store.optimisticUserMessages);
  const serverMessages = activeThread?.messages;
  const timelineMessages = useMemo(() => {
    const messages = serverMessages ?? [];
    const serverMessagesWithPreviewHandoff =
      Object.keys(attachmentPreviewHandoffByMessageId).length === 0
        ? messages
        : // Spread only fires for the few messages that actually changed;
        // unchanged ones early-return their original reference.
        // In-place mutation would break React's immutable state contract.
        // oxlint-disable-next-line no-map-spread
        messages.map((message) => {
          if (
            message.role !== "user" ||
            !message.attachments ||
            message.attachments.length === 0
          ) {
            return message;
          }
          const handoffPreviewUrls = attachmentPreviewHandoffByMessageId[message.id];
          if (!handoffPreviewUrls || handoffPreviewUrls.length === 0) {
            return message;
          }

          let changed = false;
          let imageIndex = 0;
          const attachments = message.attachments.map((attachment) => {
            if (attachment.type !== "image") {
              return attachment;
            }
            const handoffPreviewUrl = handoffPreviewUrls[imageIndex];
            imageIndex += 1;
            if (!handoffPreviewUrl || attachment.previewUrl === handoffPreviewUrl) {
              return attachment;
            }
            changed = true;
            return {
              ...attachment,
              previewUrl: handoffPreviewUrl,
            };
          });

          return changed ? { ...message, attachments } : message;
        });

    if (optimisticUserMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    const serverIds = new Set(serverMessagesWithPreviewHandoff.map((message) => message.id));
    const pendingMessages = optimisticUserMessages.filter((message) => !serverIds.has(message.id));
    if (pendingMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    return [...serverMessagesWithPreviewHandoff, ...pendingMessages];
  }, [serverMessages, attachmentPreviewHandoffByMessageId, optimisticUserMessages]);
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(timelineMessages, activeThread?.proposedPlans ?? [], workLogEntries),
    [activeThread?.proposedPlans, timelineMessages, workLogEntries],
  );

  return {
    timelineEntries
  }
}
