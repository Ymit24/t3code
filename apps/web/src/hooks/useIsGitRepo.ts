import { useQuery } from "@tanstack/react-query";
import { gitBranchesQueryOptions } from "~/lib/gitReactQuery";
import type { Thread } from "../types";
import { useActiveProject } from "./useActiveProject";

export function useIsGitRepo(activeThread: Thread): boolean {
  const activeProject = useActiveProject(activeThread);
  const gitCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;
  const branchesQuery = useQuery(gitBranchesQueryOptions(gitCwd));

  // Default true while loading to avoid toolbar flicker.
  return branchesQuery.data?.isRepo ?? true;
}
