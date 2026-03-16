import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";
import { Thread } from "~/types";
import { ProviderHealthBanner } from "./ProviderHealthBanner";
import { ThreadErrorBanner } from "./ThreadErrorBanner";
import { ServerProviderStatus } from "@t3tools/contracts";
import useSetThreadError from "~/hooks/chat/useSetThreadError";

const EMPTY_PROVIDER_STATUSES: ServerProviderStatus[] = [];

export default function ChatBanners({ activeThread }: { activeThread: Thread }) {
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const providerStatuses = serverConfigQuery.data?.providers ?? EMPTY_PROVIDER_STATUSES;

  const activeProvider = activeThread?.session?.provider ?? "codex";
  const activeProviderStatus = useMemo(
    () => providerStatuses.find((status) => status.provider === activeProvider) ?? null,
    [activeProvider, providerStatuses],
  );
  const setThreadError = useSetThreadError();
  return (
    <>
      <ProviderHealthBanner status={activeProviderStatus} />
      <ThreadErrorBanner
        error={activeThread.error}
        onDismiss={() => setThreadError(activeThread.id, null)}
      />
    </>
  );
}
