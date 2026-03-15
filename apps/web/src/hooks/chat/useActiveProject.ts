import { useStore } from "~/store";
import { Thread } from "~/types";

export function useActiveProject(activeThread: Thread) {
  const projects = useStore((store) => store.projects);
  return projects.find((p) => p.id === activeThread?.projectId);
}
