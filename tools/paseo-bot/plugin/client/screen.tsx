import { Console } from "./console";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { actionRpc, resultRpc, syncInput, syncRpc } from "../shared/contracts";
import type { Action, Filters, Snapshot, TaskRow } from "../shared/contracts";
import { UiProvider } from "./ui";

export function BotScreen(p: PluginScreenProps) {
  return <Connected key={p.host.id} {...p} />;
}
function Connected({ theme, host, layout }: PluginScreenProps) {
  const read = useRpc(syncRpc),
    act = useRpc(actionRpc),
    result = useRpc(resultRpc);
  const [filters, setFilters] = useState<Filters>(() => syncInput.parse({})),
    [conversation, setConversation] = useState("");
  const [selected, select] = useState<TaskRow | null>(null),
    [pending, setPending] = useState(false);
  const cache = useRef(new Map<string, Snapshot>());
  const data = useQuery({
    queryKey: ["paseo-bot-v2", host.id, conversation, filters],
    queryFn: () => read({ ...filters, conversationId: conversation }),
    retry: false,
    refetchIntervalInBackground: true,
    refetchInterval: (q) =>
      q.state.status === "error"
        ? Math.min(30000, 5000 * 2 ** q.state.fetchFailureCount)
        : q.state.data?.deliveryState
          ? 2000
          : Object.entries(q.state.data?.queue ?? {}).some(
                ([k, v]) =>
                  ["running", "dispatching", "ready"].includes(k) && v > 0,
              )
            ? 5000
            : 10000,
  });
  const detail = useQuery({
    queryKey: ["paseo-bot-detail", host.id, selected?.id],
    queryFn: () => result({ id: selected!.id }),
    enabled: !!selected,
    retry: false,
    refetchIntervalInBackground: true,
    refetchInterval: selected ? 10000 : false,
  });
  if (data.data) {
    cache.current.set(conversation, data.data);
    if (!conversation && data.data.conversations[0])
      cache.current.set(data.data.conversations[0].id, data.data);
  }
  const snapshot = data.data ?? cache.current.get(conversation);
  const lock = useRef(false);
  async function action(input: Action) {
    if (lock.current) throw Error("A request is pending");
    lock.current = true;
    setPending(true);
    try {
      const r = await act(input);
      if (r.conversationId) setConversation(r.conversationId);
      await data.refetch();
      return r;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <BotView
      theme={theme}
      compact={layout.compact}
      data={snapshot}
      loading={data.isPending}
      error={data.isError}
      refreshing={data.isFetching}
      filters={filters}
      setFilters={(f) => setFilters((old) => ({ ...old, ...f }))}
      conversation={conversation || snapshot?.conversations[0]?.id || ""}
      setConversation={(id) => {
        setConversation(id);
        setFilters((f) => ({ ...f, scope: "", offset: 0, before: undefined }));
        select(null);
      }}
      action={action}
      pending={pending}
      refresh={() => void data.refetch()}
      selected={selected}
      select={select}
      detail={detail.data}
      detailLoading={detail.isPending}
      detailError={detail.isError}
    />
  );
}
export type ActionResult = {
  accepted?: boolean;
  conversationId?: string;
  messageId?: string;
  taskIds?: string[];
};
export type Props = {
  theme: PluginTheme;
  compact: boolean;
  data?: Snapshot;
  loading: boolean;
  error: boolean;
  refreshing?: boolean;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  conversation: string;
  setConversation: (id: string) => void;
  action: (input: Action) => Promise<ActionResult>;
  pending: boolean;
  refresh: () => void;
  selected: TaskRow | null;
  select: (r: TaskRow | null) => void;
  detail?: Record<string, unknown>;
  detailLoading: boolean;
  detailError: boolean;
};
export function BotView(p: Props) {
  return (
    <UiProvider value={p.theme}>
      <Console {...p} />
    </UiProvider>
  );
}
