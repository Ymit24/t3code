import { useCallback } from "react";
import { useChatViewStore } from "~/components/ChatViewStoreProvider";

export default function useScheduleComposerFocus() {
  const focusComposer = useChatViewStore((store) => store.focusComposer);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);
  return scheduleComposerFocus;
}
