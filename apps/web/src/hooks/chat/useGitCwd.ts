import { Thread } from "~/types";
import { useActiveProject } from "./useActiveProject";

export default function useGitCwd(activeThread: Thread) {
  const activeProject = useActiveProject(activeThread);
  return activeThread?.worktreePath ?? activeProject?.cwd;
}
