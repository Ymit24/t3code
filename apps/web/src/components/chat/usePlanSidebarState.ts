import { useCallback, useEffect, useRef, useState } from "react";

interface UsePlanSidebarStateArgs {
  activeThreadId: string | null;
  activePlanTurnId: string | null;
  activeProposedPlanTurnId: string | null;
}

function currentTurnKey(
  activePlanTurnId: string | null,
  activeProposedPlanTurnId: string | null,
): string | null {
  return activePlanTurnId ?? activeProposedPlanTurnId ?? null;
}

export function usePlanSidebarState({
  activeThreadId,
  activePlanTurnId,
  activeProposedPlanTurnId,
}: UsePlanSidebarStateArgs) {
  const [planSidebarOpen, setPlanSidebarOpen] = useState(false);
  const planSidebarDismissedForTurnRef = useRef<string | null>(null);
  const planSidebarOpenOnNextThreadRef = useRef(false);

  const dismissPlanSidebar = useCallback(() => {
    setPlanSidebarOpen(false);
    const turnKey = currentTurnKey(activePlanTurnId, activeProposedPlanTurnId);
    if (turnKey) {
      planSidebarDismissedForTurnRef.current = turnKey;
    }
  }, [activePlanTurnId, activeProposedPlanTurnId]);

  const openPlanSidebar = useCallback(() => {
    planSidebarDismissedForTurnRef.current = null;
    setPlanSidebarOpen(true);
  }, []);

  const togglePlanSidebar = useCallback(() => {
    setPlanSidebarOpen((open) => {
      if (open) {
        const turnKey = currentTurnKey(activePlanTurnId, activeProposedPlanTurnId);
        if (turnKey) {
          planSidebarDismissedForTurnRef.current = turnKey;
        }
      } else {
        planSidebarDismissedForTurnRef.current = null;
      }
      return !open;
    });
  }, [activePlanTurnId, activeProposedPlanTurnId]);

  const markPlanSidebarOpenOnNextThread = useCallback(() => {
    planSidebarOpenOnNextThreadRef.current = true;
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    if (planSidebarOpenOnNextThreadRef.current) {
      planSidebarOpenOnNextThreadRef.current = false;
      setPlanSidebarOpen(true);
    } else {
      setPlanSidebarOpen(false);
    }
    planSidebarDismissedForTurnRef.current = null;
  }, [activeThreadId]);

  return {
    planSidebarOpen,
    setPlanSidebarOpen,
    openPlanSidebar,
    dismissPlanSidebar,
    togglePlanSidebar,
    markPlanSidebarOpenOnNextThread,
    planSidebarDismissedForTurnRef,
  };
}
