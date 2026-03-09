import { type Thread } from "../types";

export interface ThreadListItemEntry {
  kind: "thread";
  key: string;
  thread: Thread;
  latestCreatedAtMs: number;
}

export interface ThreadListBranchGroupEntry {
  kind: "branch-group";
  key: string;
  branch: string;
  threads: Thread[];
  latestCreatedAtMs: number;
}

export type ProjectThreadListEntry = ThreadListItemEntry | ThreadListBranchGroupEntry;

function createdAtMs(thread: Thread): number {
  const value = Date.parse(thread.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

export function sortThreadsNewestFirst(threads: readonly Thread[]): Thread[] {
  return [...threads].toSorted((a, b) => {
    const byDate = createdAtMs(b) - createdAtMs(a);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

export function buildProjectThreadListEntries(
  threads: readonly Thread[],
): ProjectThreadListEntry[] {
  const sortedThreads = sortThreadsNewestFirst(threads);
  const branchGroups = new Map<string, Thread[]>();
  const entries: ProjectThreadListEntry[] = [];

  for (const thread of sortedThreads) {
    const branch = thread.branch?.trim() ?? "";
    if (branch.length === 0) {
      entries.push({
        kind: "thread",
        key: `thread:${thread.id}`,
        thread,
        latestCreatedAtMs: createdAtMs(thread),
      });
      continue;
    }

    const existing = branchGroups.get(branch);
    if (existing) {
      existing.push(thread);
    } else {
      branchGroups.set(branch, [thread]);
    }
  }

  for (const [branch, groupedThreads] of branchGroups) {
    entries.push({
      kind: "branch-group",
      key: `branch:${branch}`,
      branch,
      threads: groupedThreads,
      latestCreatedAtMs: createdAtMs(groupedThreads[0] ?? groupedThreads[groupedThreads.length - 1]!),
    });
  }

  return entries.toSorted((a, b) => {
    const byDate = b.latestCreatedAtMs - a.latestCreatedAtMs;
    if (byDate !== 0) return byDate;
    return b.key.localeCompare(a.key);
  });
}
