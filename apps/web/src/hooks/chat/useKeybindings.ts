import { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

export function useKeybindings() {
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  return keybindings;
}
