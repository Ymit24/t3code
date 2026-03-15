import { ThreadId } from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { parseDiffRouteSearch, stripDiffSearchParams } from "~/diffRouteSearch";

export default function useToggleDiff(threadId: ThreadId) {
  const navigate = useNavigate();
  const rawSearch = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const diffOpen = rawSearch.diff === "1";
  const onToggleDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return diffOpen ? { ...rest, diff: undefined } : { ...rest, diff: "1" };
      },
    });
  }, [diffOpen, navigate, threadId]);

  return {
    diffOpen, onToggleDiff
  }
}
