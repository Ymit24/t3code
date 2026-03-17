import { ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { selectThreadChatViewState, useChatViewStateStore } from "./chatViewStateStore";

const THREAD_A = ThreadId.makeUnsafe("thread-a");
const THREAD_B = ThreadId.makeUnsafe("thread-b");
const THREAD_EMPTY = ThreadId.makeUnsafe("");

describe("chatViewStateStore", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    useChatViewStateStore.setState({ chatViewStateByThreadId: {} });
  });

  it("returns a default state for unknown threads", () => {
    const state = selectThreadChatViewState(
      useChatViewStateStore.getState().chatViewStateByThreadId,
      THREAD_A,
    );

    expect(state).toEqual({ localDraftError: null });
  });

  it("stores a local draft error per thread", () => {
    useChatViewStateStore.getState().setLocalDraftError(THREAD_A, "missing branch");

    const state = selectThreadChatViewState(
      useChatViewStateStore.getState().chatViewStateByThreadId,
      THREAD_A,
    );

    expect(state).toEqual({ localDraftError: "missing branch" });
  });

  it("keeps thread state isolated", () => {
    const store = useChatViewStateStore.getState();
    store.setLocalDraftError(THREAD_A, "error A");
    store.setLocalDraftError(THREAD_B, "error B");

    expect(
      selectThreadChatViewState(useChatViewStateStore.getState().chatViewStateByThreadId, THREAD_A),
    ).toEqual({ localDraftError: "error A" });
    expect(
      selectThreadChatViewState(useChatViewStateStore.getState().chatViewStateByThreadId, THREAD_B),
    ).toEqual({ localDraftError: "error B" });
  });

  it("removes thread state when resetting back to default", () => {
    const store = useChatViewStateStore.getState();
    store.setLocalDraftError(THREAD_A, "error A");
    store.setLocalDraftError(THREAD_A, null);

    expect(useChatViewStateStore.getState().chatViewStateByThreadId[THREAD_A]).toBeUndefined();
    expect(
      selectThreadChatViewState(useChatViewStateStore.getState().chatViewStateByThreadId, THREAD_A),
    ).toEqual({ localDraftError: null });
  });

  it("ignores empty thread ids", () => {
    const store = useChatViewStateStore.getState();
    const before = store.chatViewStateByThreadId;

    store.setLocalDraftError(THREAD_EMPTY, "ignored");

    expect(useChatViewStateStore.getState().chatViewStateByThreadId).toBe(before);
  });

  it("removes only orphaned thread states", () => {
    const store = useChatViewStateStore.getState();
    store.setLocalDraftError(THREAD_A, "error A");
    store.setLocalDraftError(THREAD_B, "error B");

    store.removeOrphanedThreadStates(new Set([THREAD_A]));

    expect(
      selectThreadChatViewState(useChatViewStateStore.getState().chatViewStateByThreadId, THREAD_A),
    ).toEqual({ localDraftError: "error A" });
    expect(useChatViewStateStore.getState().chatViewStateByThreadId[THREAD_B]).toBeUndefined();
  });

  it("persists the per-thread state shape", () => {
    useChatViewStateStore.getState().setLocalDraftError(THREAD_A, "persist me");

    const raw = localStorage.getItem("t3code:chat-view-state:v1");
    expect(raw).not.toBeNull();
    expect(raw).toContain("chatViewStateByThreadId");
    expect(raw).toContain("persist me");
  });
});
