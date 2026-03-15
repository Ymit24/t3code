import { Thread } from "~/types";
import { MessagesTimeline } from "./MessagesTimeline";
import { useCallback, useRef, useState } from "react";
import { isScrollContainerNearBottom } from "~/chat-scroll";

export function ChatMessageTimelineArea({ activeThread }: { activeThread: Thread }) {
  const [scrollContainerElement, setScrollContainerElement] = useState<HTMLDivElement | null>(null);
  const updateScrollContainerElement = useCallback((node: HTMLDivElement | null) => {
    setScrollContainerElement(node);
  }, []);

  const shouldAutoScrollRef = useRef(true);
  const pendingUserScrollUpIntentRef = useRef(false);
  const lastKnownScrollTopRef = useRef(0);
  const isPointerScrollActiveRef = useRef(false);
  const lastTouchClientYRef = useRef<number | null>(null);
  const pendingInteractionAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const pendingInteractionAnchorFrameRef = useRef<number | null>(null);

  const onMessagesScroll = useCallback(() => {
    const scrollContainer = scrollContainerElement;
    if (!scrollContainer) return;
    const currentScrollTop = scrollContainer.scrollTop;
    const isNearBottom = isScrollContainerNearBottom(scrollContainer);

    if (!shouldAutoScrollRef.current && isNearBottom) {
      shouldAutoScrollRef.current = true;
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && pendingUserScrollUpIntentRef.current) {
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && isPointerScrollActiveRef.current) {
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
    } else if (shouldAutoScrollRef.current && !isNearBottom) {
      // Catch-all for keyboard/assistive scroll interactions.
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
    }

    lastKnownScrollTopRef.current = currentScrollTop;
  }, [scrollContainerElement]);

  const onMessagesWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      pendingUserScrollUpIntentRef.current = true;
    }
  }, []);
  const onMessagesPointerDown = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = true;
  }, []);
  const onMessagesPointerUp = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = false;
  }, []);
  const onMessagesPointerCancel = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = false;
  }, []);
  const onMessagesTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    lastTouchClientYRef.current = touch.clientY;
  }, []);
  const onMessagesTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const previousTouchY = lastTouchClientYRef.current;
    if (previousTouchY !== null && touch.clientY > previousTouchY + 1) {
      pendingUserScrollUpIntentRef.current = true;
    }
    lastTouchClientYRef.current = touch.clientY;
  }, []);
  const onMessagesTouchEnd = useCallback((_event: React.TouchEvent<HTMLDivElement>) => {
    lastTouchClientYRef.current = null;
  }, []);
  const cancelPendingInteractionAnchorAdjustment = useCallback(() => {
    const pendingFrame = pendingInteractionAnchorFrameRef.current;
    if (pendingFrame === null) return;
    pendingInteractionAnchorFrameRef.current = null;
    window.cancelAnimationFrame(pendingFrame);
  }, []);
  const onMessagesClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const scrollContainer = scrollContainerElement;
      if (!scrollContainer || !(event.target instanceof Element)) return;

      const trigger = event.target.closest<HTMLElement>(
        "button, summary, [role='button'], [data-scroll-anchor-target]",
      );
      if (!trigger || !scrollContainer.contains(trigger)) return;
      if (trigger.closest("[data-scroll-anchor-ignore]")) return;

      pendingInteractionAnchorRef.current = {
        element: trigger,
        top: trigger.getBoundingClientRect().top,
      };

      cancelPendingInteractionAnchorAdjustment();
      pendingInteractionAnchorFrameRef.current = window.requestAnimationFrame(() => {
        pendingInteractionAnchorFrameRef.current = null;
        const anchor = pendingInteractionAnchorRef.current;
        pendingInteractionAnchorRef.current = null;
        const activeScrollContainer = scrollContainerElement;
        if (!anchor || !activeScrollContainer) return;
        if (!anchor.element.isConnected || !activeScrollContainer.contains(anchor.element)) return;

        const nextTop = anchor.element.getBoundingClientRect().top;
        const delta = nextTop - anchor.top;
        if (Math.abs(delta) < 0.5) return;

        activeScrollContainer.scrollTop += delta;
        lastKnownScrollTopRef.current = activeScrollContainer.scrollTop;
      });
    },
    [cancelPendingInteractionAnchorAdjustment, scrollContainerElement],
  );

  return (
    <div
      ref={updateScrollContainerElement}
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
        scrollContainer={scrollContainerElement}
      />
    </div>
  );
}
