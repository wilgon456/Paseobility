import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { actionRpc, resultRpc, syncInput, syncRpc } from "../shared/contracts";
import type {
  Action,
  Filters,
  Plan,
  Snapshot,
  TaskRow,
} from "../shared/contracts";
import { makeTaskId, relativeTime } from "../shared/model";
import { Board } from "./board";
import { Chat } from "./chat";
import type { DraftState } from "./chat";
import { Detail } from "./detail";
import {
  Button,
  Glyph,
  Notice,
  Select,
  Skeleton,
  UiProvider,
  useUi,
} from "./ui";
import { shortcuts } from "./web";

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
function Console(p: Props) {
  const t = useUi(),
    toast = useToast(),
    [view, setView] = useState<"kanban" | "list">("kanban"),
    [tab, setTab] = useState("chat");
  const [confirm, setConfirm] = useState<Plan | null>(null),
    [retry, setRetry] = useState<TaskRow | null>(null),
    [memory, setMemory] = useState<string | null>(null),
    [memoryProject, setMemoryProject] = useState("");
  const searchRef = useRef<TextInput>(null),
    composerRef = useRef<TextInput>(null),
    [now, setNow] = useState(Date.now() / 1000);
  const createId = useRef<string | null>(null),
    retryId = useRef<{ task: string; id: string } | null>(null);
  const drafts=useRef(new Map<string,DraftState>());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () =>
      shortcuts(
        () => {
          setTab("board");
          setTimeout(() => searchRef.current?.focus(), 0);
        },
        () => {
          setTab("chat");
          setTimeout(() => composerRef.current?.focus(), 0);
        },
      ),
    [],
  );
  async function perform(input: Action) {
    try {
      return await p.action(input);
    } catch {
      toast.error(
        "요청을 확인하지 못했습니다. 연결을 확인하고 같은 요청으로 다시 시도하세요.",
      );
      throw Error("Request unconfirmed");
    }
  }
  async function create() {
    createId.current ??= makeTaskId();
    try {
      await perform({ action: "create", requestId: createId.current });
      createId.current = null;
    } catch {}
  }
  async function approve() {
    if (!confirm) return;
    try {
      const r = await perform({
        action: "approve",
        conversationId: p.conversation,
        planId: confirm.id,
        digest: confirm.digest,
      });
      toast.show(`${r.taskIds?.length ?? 0}개 작업을 접수했습니다.`, {
        variant: "success",
      });
      setConfirm(null);
    } catch {}
  }
  async function askRetry() {
    if (!retry) return;
    if(retryId.current?.task!==retry.id)retryId.current={task:retry.id,id:makeTaskId()};
    try {
      let id = p.conversation;
      if (!id)
        id = (await perform({ action: "create", requestId: makeTaskId() }))
          .conversationId!;
      await perform({
        action: "send",
        conversationId: id,
        messageId: retryId.current.id,
        text: "이 실패 작업의 원인을 검토하고 재시도 계획을 제안해 주세요. 기존 작업과 에이전트는 보존해 주세요.",
        retryOf: retry.id,
      });
      setRetry(null);
      retryId.current=null;
      setTab("chat");
      toast.show("봇에게 재검토를 요청했습니다.");
    } catch {}
  }
  const queue = p.data?.queue ?? {},
    counts = [
      {
        label: "대기",
        n: (queue.queued ?? 0) + (queue.ready ?? 0),
        icon: "CircleDashed",
      },
      {
        label: "실행",
        n:
          (queue.running ?? 0) +
          (queue.dispatching ?? 0) +
          (queue.repairing ?? 0),
        icon: "Activity",
      },
      { label: "성공", n: queue.passed ?? 0, icon: "CircleCheck" },
      { label: "실패", n: queue.failed ?? 0, icon: "CircleX" },
    ];
  const current = p.data?.conversations.find((c) => c.id === p.conversation);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.c.surface0,
        padding: p.compact ? 16 : 24,
        gap: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{ ...t.heading, fontSize: 24, lineHeight: 32 }}
          >
            Paseo 봇
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Glyph name={p.error ? "WifiOff" : "ShieldCheck"} size={14} />
            <Text style={t.muted}>
              VAXPORT ·{" "}
              {p.error ? "다시 연결 중" : p.loading ? "연결 중" : "연결됨"}
            </Text>
          </View>
        </View>
        <Text style={t.small}>N 새 요청 · / 검색</Text>
        <Button
          label="새로고침"
          icon="RefreshCw"
          disabled={p.refreshing}
          onPress={p.refresh}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {counts.map((c) => (
          <View
            key={c.label}
            style={{
              ...t.panel,
              flex: 1,
              minWidth: p.compact ? 60 : 100,
              padding: 12,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <Glyph name={c.icon} size={14} />
              <Text style={t.small}>{c.label}</Text>
            </View>
            <Text
              style={{
                ...t.heading,
                fontSize: 22,
                lineHeight: 28,
                fontVariant: ["tabular-nums"],
              }}
            >
              {p.loading ? "—" : c.n}
            </Text>
          </View>
        ))}
        <View
          style={{ ...t.panel, flex: 2, minWidth: 220, padding: 12, gap: 4 }}
        >
          <Text style={t.body}>
            {p.data?.healthy ? "실행기 정상" : "실행기 확인 필요"} ·{" "}
            {(queue.blocked ?? 0) + (queue.unknown ?? 0)}건 검토 필요
          </Text>
          <Text style={t.small}>
            마지막 하트비트 {relativeTime(p.data?.lastTickAt ?? 0, now)}
          </Text>
          <Text style={t.small}>
            매니저{" "}
            {p.data?.managerHealthy
              ? p.data.deliveryState
                ? "답변 준비 중"
                : "대기 중"
              : "연결 확인 중"}
          </Text>
        </View>
      </View>
      {p.error && (
        <Notice title="VAXPORT와 연결이 끊겼습니다" error>
          <Text style={t.muted}>
            자동으로 다시 연결합니다.{" "}
            {p.data
              ? `마지막 확인 ${relativeTime(p.data.lastSyncAt, now)}. 표시된 정보는 이전 상태일 수 있습니다.`
              : "Tailscale과 SSH 연결을 확인해 주세요."}
          </Text>
          <Button label="지금 다시 연결" onPress={p.refresh} />
        </Notice>
      )}
      {p.data && !p.data.configured && (
        <Notice title="대화 매니저 준비가 필요합니다">
          VAXPORT에서 GUI 데이터 이관과 매니저 서비스를 준비해 주세요.
        </Notice>
      )}
      {p.compact && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="대화"
            selected={tab === "chat"}
            onPress={() => setTab("chat")}
          />
          <Button
            label="작업"
            selected={tab === "board"}
            onPress={() => setTab("board")}
          />
        </View>
      )}
      <View
        style={{
          flex: 1,
          minHeight: 260,
          flexDirection: p.compact ? "column" : "row",
          gap: 20,
        }}
      >
        {(!p.compact || tab === "chat") && (
          <View
            style={{
              ...t.panel,
              flex: p.compact ? 1 : 0.8,
              minWidth: p.compact ? 0 : 320,
              maxWidth: p.compact ? undefined : 500,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderColor: t.c.border,
                gap: 8,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Glyph name="Bot" />
                <View style={{ flex: 1 }}>
                  <Text style={t.heading}>봇과 대화</Text>
                  <Text style={t.small}>
                    {current?.status === "running"
                      ? "요청을 살펴보고 있습니다"
                      : "계획을 확인한 뒤 작업을 시작합니다"}
                  </Text>
                </View>
                <Button
                  label="새 대화"
                  icon="Plus"
                  quiet
                  disabled={p.pending || !p.data?.configured || p.error}
                  onPress={() => void create()}
                />
              </View>
              {!!p.data?.conversations.length && (
                <Select
                  label="대화 세션"
                  value={p.conversation}
                  options={p.data.conversations.map((c) => ({
                    value: c.id,
                    label: c.title,
                  }))}
                  onChange={p.setConversation}
                />
              )}
            </View>
            {p.loading && !p.data ? (
              <Skeleton label="대화를 불러오는 중" />
            ) : (
              <Chat
                drafts={drafts.current}
                key={p.conversation}
                {...p}
                composerRef={composerRef}
                perform={perform}
                confirm={setConfirm}
                memory={setMemory}
                create={create}
                openTask={(id) => {
                  const task = p.data?.tasks.find((t) => t.id === id);
                  if (task) p.select(task);
                  else {
                    p.setFilters({
                      query: id,
                      offset: 0,
                      scope: "",
                      group: "",
                      project: "",
                      machine: "",
                      requester: "",
                    });
                    setTab("board");
                  }
                }}
              />
            )}
          </View>
        )}
        {(!p.compact || tab === "board") && (
          <Board
            data={p.data}
            loading={p.loading}
            filters={p.filters}
            setFilters={p.setFilters}
            view={view}
            setView={setView}
            open={p.select}
            retry={(r) => setRetry(r)}
            searchRef={searchRef}
            conversation={p.conversation}
            now={now}
          />
        )}
      </View>
      {p.selected && (
        <Detail
          key={p.selected.id}
          task={p.selected}
          data={p.detail}
          loading={p.detailLoading}
          error={p.detailError}
          close={() => p.select(null)}
          retry={() => {
            setRetry(p.selected);
            p.select(null);
          }}
        />
      )}
      {confirm && (
        <Modal
          title="작업 계획 확인"
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
        >
          <Modal.Content>
            <Text style={t.muted}>
              아래 내용으로 접수하면 봇이 작업을 시작합니다. 변경할 부분이
              있으면 대화로 알려주세요.
            </Text>
            {confirm.tasks.map((task, i) => (
              <View key={i} style={{ ...t.panel, padding: 16, gap: 8 }}>
                <Text style={t.heading}>
                  {i + 1}. {task.title}
                </Text>
                <Text style={t.small}>
                  {task.project} · {task.machine || "자동 배정"} · {task.kind}
                </Text>
                <Text selectable style={t.body}>
                  {task.prompt}
                </Text>
                {!!task.dependsOn?.length && (
                  <Text style={t.small}>
                    선행 작업: {task.dependsOn.map((n) => n + 1).join(", ")}
                  </Text>
                )}
              </View>
            ))}
            <Button
              label="확인하고 접수"
              primary
              icon="Check"
              disabled={p.pending || p.error}
              onPress={() => void approve()}
            />
            <Button
              label="취소하고 수정하기"
              disabled={p.pending}
              onPress={() => {
                void perform({
                  action: "reject",
                  conversationId: p.conversation,
                  planId: confirm.id,
                })
                  .then(() => setConfirm(null))
                  .catch(() => {});
              }}
            />
          </Modal.Content>
        </Modal>
      )}
      {retry && (
        <Modal
          title="실패 작업 재검토"
          open
          onOpenChange={(open) => {
            if (!open) setRetry(null);
          }}
        >
          <Modal.Content>
            <Text style={t.heading}>{retry.title}</Text>
            <Text style={t.body}>
              봇이 실패 원인과 기존 에이전트를 확인한 뒤 새 계획을 제안합니다.
              계획을 다시 확인해야 새 작업이 접수됩니다.
            </Text>
            <Text style={t.small}>원래 작업과 기록은 그대로 보존합니다.</Text>
            <Button
              label="봇에게 재검토 요청"
              primary
              disabled={p.pending || p.error}
              onPress={() => void askRetry()}
            />
            <Button label="돌아가기" onPress={() => setRetry(null)} />
          </Modal.Content>
        </Modal>
      )}
      {memory && (
        <Modal
          title="프로젝트에 기억하기"
          open
          onOpenChange={(open) => {
            if (!open) setMemory(null);
          }}
        >
          <Modal.Content>
            <Text style={t.muted}>
              선택한 봇 답변을 이 프로젝트의 참고 기록으로 저장합니다. 실행
              권한이나 승인으로 사용하지 않습니다.
            </Text>
            <Select
              label="기억할 프로젝트"
              value={memoryProject}
              options={(p.data?.projects ?? [])
                .filter((p) => p.enabled)
                .map((p) => ({ value: p.id, label: p.id }))}
              onChange={setMemoryProject}
            />
            <Button
              label="확인하고 기억하기"
              primary
              disabled={!memoryProject || p.pending}
              onPress={() => {
                void perform({
                  action: "remember",
                  conversationId: p.conversation,
                  messageId: memory,
                  project: memoryProject,
                })
                  .then(() => {
                    setMemory(null);
                    toast.show("프로젝트 참고 기록에 저장했습니다.");
                  })
                  .catch(() => {});
              }}
            />
          </Modal.Content>
        </Modal>
      )}
    </View>
  );
}
