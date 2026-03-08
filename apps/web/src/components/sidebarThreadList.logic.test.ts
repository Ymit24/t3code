import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "../types";
import { buildProjectThreadListSections, THREAD_PREVIEW_LIMIT } from "./sidebarThreadList.logic";

function makeThread(index: number, overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe(`thread-${index}`),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: `Thread ${index}`,
    model: "gpt-5.4",
    isPinned: false,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: `2026-03-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

describe("buildProjectThreadListSections", () => {
  it("renders pinned threads before unpinned threads", () => {
    const sections = buildProjectThreadListSections(
      [makeThread(1), makeThread(3, { isPinned: true }), makeThread(2)],
      ProjectId.makeUnsafe("project-1"),
      false,
    );

    expect(sections.allVisibleThreads.map((thread) => thread.id)).toEqual([
      "thread-3",
      "thread-2",
      "thread-1",
    ]);
  });

  it("does not count pinned threads against the preview limit", () => {
    const pinnedThreads = Array.from({ length: 2 }, (_, index) =>
      makeThread(20 + index, { isPinned: true }),
    );
    const unpinnedThreads = Array.from({ length: THREAD_PREVIEW_LIMIT + 2 }, (_, index) =>
      makeThread(index + 1),
    );

    const sections = buildProjectThreadListSections(
      [...pinnedThreads, ...unpinnedThreads],
      ProjectId.makeUnsafe("project-1"),
      false,
    );

    expect(sections.pinnedThreads).toHaveLength(2);
    expect(sections.visibleUnpinnedThreads).toHaveLength(THREAD_PREVIEW_LIMIT);
    expect(sections.allVisibleThreads).toHaveLength(2 + THREAD_PREVIEW_LIMIT);
    expect(sections.hasHiddenThreads).toBe(true);
  });

  it("shows the separator only when both pinned and visible unpinned threads exist", () => {
    const mixed = buildProjectThreadListSections(
      [makeThread(1, { isPinned: true }), makeThread(2)],
      ProjectId.makeUnsafe("project-1"),
      false,
    );
    const pinnedOnly = buildProjectThreadListSections(
      [makeThread(1, { isPinned: true })],
      ProjectId.makeUnsafe("project-1"),
      false,
    );

    expect(mixed.shouldShowPinnedSeparator).toBe(true);
    expect(pinnedOnly.shouldShowPinnedSeparator).toBe(false);
  });

  it("bases hidden-thread detection only on unpinned threads", () => {
    const sections = buildProjectThreadListSections(
      Array.from({ length: THREAD_PREVIEW_LIMIT }, (_, index) =>
        makeThread(index + 1, { isPinned: index < 3 }),
      ),
      ProjectId.makeUnsafe("project-1"),
      false,
    );

    expect(sections.hasHiddenThreads).toBe(false);
  });
});
