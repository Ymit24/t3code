import { describe, expect, it } from "vitest";
import { buildProjectThreadListEntries } from "./threadGroups";
import { type Thread } from "../types";

function makeThread(input: Partial<Thread> & Pick<Thread, "id" | "projectId" | "title" | "createdAt">): Thread {
  return {
    id: input.id,
    codexThreadId: null,
    projectId: input.projectId,
    title: input.title,
    model: "gpt-5",
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: input.createdAt,
    latestTurn: null,
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
    turnDiffSummaries: [],
    activities: [],
  };
}

describe("buildProjectThreadListEntries", () => {
  it("groups branch-backed threads and leaves branchless threads as standalone entries", () => {
    const entries = buildProjectThreadListEntries([
      makeThread({
        id: "thread-1" as Thread["id"],
        projectId: "project-1" as Thread["projectId"],
        title: "Fix login",
        createdAt: "2026-03-08T10:00:00.000Z",
        branch: "feature/auth",
      }),
      makeThread({
        id: "thread-2" as Thread["id"],
        projectId: "project-1" as Thread["projectId"],
        title: "Follow-up auth",
        createdAt: "2026-03-08T11:00:00.000Z",
        branch: "feature/auth",
      }),
      makeThread({
        id: "thread-3" as Thread["id"],
        projectId: "project-1" as Thread["projectId"],
        title: "Mainline question",
        createdAt: "2026-03-08T12:00:00.000Z",
        branch: null,
      }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: "thread",
      thread: { id: "thread-3" },
    });
    expect(entries[1]).toMatchObject({
      kind: "branch-group",
      branch: "feature/auth",
    });
    expect(entries[1]?.kind === "branch-group" ? entries[1].threads.map((thread) => thread.id) : []).toEqual([
      "thread-2",
      "thread-1",
    ]);
  });

  it("trims branch names before grouping", () => {
    const entries = buildProjectThreadListEntries([
      makeThread({
        id: "thread-1" as Thread["id"],
        projectId: "project-1" as Thread["projectId"],
        title: "A",
        createdAt: "2026-03-08T10:00:00.000Z",
        branch: " feature/ui ",
      }),
      makeThread({
        id: "thread-2" as Thread["id"],
        projectId: "project-1" as Thread["projectId"],
        title: "B",
        createdAt: "2026-03-08T11:00:00.000Z",
        branch: "feature/ui",
      }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "branch-group",
      branch: "feature/ui",
    });
  });
});
