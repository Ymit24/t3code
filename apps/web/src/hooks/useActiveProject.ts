import type { Project, Thread } from "../types";
import { useStore } from "../store";

export function useActiveProject(activeThread: Thread): Project | null {
  const projects = useStore((store) => store.projects);
  return projects.find((project) => project.id === activeThread.projectId) ?? null;
}
