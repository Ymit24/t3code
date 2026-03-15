import { ThreadId } from "@t3tools/contracts";
import { StoreApi, useStore } from "zustand";
import { ChatViewStoreState, createChatViewStore } from "~/chatViewStore";
import { createContext, useContext, useState } from "react";
import { LAST_INVOKED_SCRIPT_BY_PROJECT_KEY, LastInvokedScriptByProjectSchema } from "./ChatView.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";

const ChatViewStoreContext = createContext<StoreApi<ChatViewStoreState> | null>(null);

export function ChatViewStoreProvider({
  children,
  threadId,
}: {
  children: React.ReactNode;
  threadId: ThreadId;
}) {
  const [store] = useState(() => createChatViewStore(threadId));

  return (
    <ChatViewStoreContext.Provider value={store}>
      {children}
    </ChatViewStoreContext.Provider>
  );
}

export function useChatViewStore<T>(selector: (state: ChatViewStoreState) => T) {
  const store = useContext(ChatViewStoreContext);


  if (!store) {
    throw new Error("useChatViewStore must be used within a ChatViewStoreProvider")
  }
  return useStore(store, selector);
}
/*
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );
 */
