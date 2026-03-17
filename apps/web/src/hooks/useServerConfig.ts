import {
  type EditorId,
  type ResolvedKeybindingsConfig,
  type ServerProviderStatus,
} from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const EMPTY_AVAILABLE_EDITORS: EditorId[] = [];
const EMPTY_PROVIDER_STATUSES: ServerProviderStatus[] = [];

export function useServerConfig() {
  const serverConfigQuery = useQuery(serverConfigQueryOptions());

  return {
    serverConfigQuery,
    keybindings: serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS,
    availableEditors: serverConfigQuery.data?.availableEditors ?? EMPTY_AVAILABLE_EDITORS,
    providerStatuses: serverConfigQuery.data?.providers ?? EMPTY_PROVIDER_STATUSES,
  };
}
