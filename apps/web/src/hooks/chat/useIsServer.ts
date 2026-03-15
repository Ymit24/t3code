import { useStore } from "~/store";
import { Thread } from "~/types";

export default function useIsServerThread(activeThread: Thread) {
  const threads = useStore((store) => store.threads);
  const serverThread = threads.find((t) => t.id === activeThread.id);
  const isServerThread = serverThread !== undefined;

  return isServerThread;
}
