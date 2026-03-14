const ChatViewStoreContext = createContext<StoreApi<ChatViewStore> | null>(null);

function ChatViewStoreProvider({
  children,
  threadId,
}: {
  children: React.ReactNode;
  threadId: ThreadId;
}) {
  const storeRef = useRef<StoreApi<ChatViewStore>>(createChatViewStore(threadId));
  return (
    <ChatViewStoreContext.Provider value={storeRef.current}>
      {children}
    </ChatViewStoreContext.Provider>
  );
}

export function ChatViewWrapper({ threadId }: ChatViewProps) {
  return (
    <ChatViewStoreProvider key={threadId} threadId={threadId}>
      <ChatView threadId={threadId} />
    </ChatViewStoreProvider>
  );
}
