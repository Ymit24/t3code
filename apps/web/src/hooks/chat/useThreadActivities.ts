import { OrchestrationThreadActivity } from "@t3tools/contracts";
import { useMemo } from "react";
import { hasToolActivityForTurn } from "~/session-logic";
import { Thread } from "~/types";

const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];

export default function useThreadActivities(activeThread: Thread) {
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  const activeLatestTurn = activeThread?.latestTurn ?? null;

  const latestTurnHasToolActivity = useMemo(
    () => hasToolActivityForTurn(threadActivities, activeLatestTurn?.turnId),
    [activeLatestTurn?.turnId, threadActivities],
  );

  return { threadActivities, latestTurnHasToolActivity, activeLatestTurn };
}
