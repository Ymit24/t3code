import { useMemo } from "react";
import {
  deriveActivePlanState,
  findLatestProposedPlan,
  isLatestTurnSettled,
} from "~/session-logic";
import useThreadActivities from "./useThreadActivities";
import { Thread } from "~/types";

export default function useActivePlan(activeThread: Thread) {
  const { threadActivities, activeLatestTurn } = useThreadActivities(activeThread);

  const activePlan = useMemo(
    () => deriveActivePlanState(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);

  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);

  return { activePlan, activeProposedPlan };
}
