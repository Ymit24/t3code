import { Project, Thread } from "~/types";

export default function useGitCwd(activeThread: Thread, activeProject: Project | undefined) {
  return activeThread?.worktreePath ?? activeProject?.cwd;
}
