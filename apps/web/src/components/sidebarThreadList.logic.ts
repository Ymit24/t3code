import type { ProjectId } from "@t3tools/contracts";

import type { Thread } from "../types";

export const THREAD_PREVIEW_LIMIT = 6;

export interface ProjectThreadListSections {
  pinnedThreads: Thread[];
  visibleUnpinnedThreads: Thread[];
  allVisibleThreads: Thread[];
  hasHiddenThreads: boolean;
  shouldShowPinnedSeparator: boolean;
}

function compareThreads(left: Thread, right: Thread): number {
  const byDate = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (byDate !== 0) return byDate;
  return right.id.localeCompare(left.id);
}

export function buildProjectThreadListSections(
  threads: Thread[],
  projectId: ProjectId,
  isExpanded: boolean,
): ProjectThreadListSections {
  const projectThreads = threads.filter((thread) => thread.projectId === projectId);
  const pinnedThreads = projectThreads.filter((thread) => thread.isPinned).toSorted(compareThreads);
  const unpinnedThreads = projectThreads
    .filter((thread) => !thread.isPinned)
    .toSorted(compareThreads);
  const hasHiddenThreads = unpinnedThreads.length > THREAD_PREVIEW_LIMIT;
  const visibleUnpinnedThreads =
    hasHiddenThreads && !isExpanded
      ? unpinnedThreads.slice(0, THREAD_PREVIEW_LIMIT)
      : unpinnedThreads;

  return {
    pinnedThreads,
    visibleUnpinnedThreads,
    allVisibleThreads: [...pinnedThreads, ...visibleUnpinnedThreads],
    hasHiddenThreads,
    shouldShowPinnedSeparator: pinnedThreads.length > 0 && visibleUnpinnedThreads.length > 0,
  };
}
