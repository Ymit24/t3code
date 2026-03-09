import { queryOptions } from "@tanstack/react-query";
import { serverConfigQueryOptions } from "./serverReactQuery";

export function availableEditorsQueryOptions() {
  return queryOptions({
    ...serverConfigQueryOptions(),
    select: (data) => data.availableEditors,
  });
}
