import { useQuery } from "@tanstack/react-query";
import { gitBranchesQueryOptions } from "~/lib/gitReactQuery";
import useGitCwd from "./useGitCwd";
import { Thread } from "~/types";

export default function useIsGitRepo(activeThread: Thread) {
  const gitCwd = useGitCwd(activeThread);
  const branchesQuery = useQuery(gitBranchesQueryOptions(gitCwd ?? null));

  const isGitRepo = branchesQuery.data?.isRepo ?? true;
  return isGitRepo;
}
