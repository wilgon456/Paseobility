import { useEffect, useRef, useState } from "react";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Action, Plan, TaskRow } from "../shared/contracts";
import { makeTaskId, relativeTime } from "../shared/model";
import type { Props } from "./screen";
import { Chat, type DraftState } from "./chat";
import { Board } from "./board";
import { Detail } from "./detail";
import { Button, Glyph, Notice, Skeleton, StatusIcon, useUi } from "./ui";
import { statusTone, toneInk } from "../shared/colors";
import { shortcuts } from "./web";

export function Console(p: Props) {
  const t = useUi(),
    toast = useToast();
  const [board, setBoard] = useState(false),
    [history, setHistory] = useState(false),
    [view, setView] = useState<"kanban" | "list">("kanban");
  const [retry, setRetry] = useState<TaskRow | null>(null),
    [memory, setMemory] = useState<string | null>(null),
    [now, setNow] = useState(Date.now() / 1000);
  const searchRef = useRef<TextInput>(null),
    composerRef = useRef<TextInput>(null),
    drafts = useRef(new Map<string, DraftState>());
  const createId = useRef<string | null>(null),
    retryId = useRef<{ task: string; id: string } | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () =>
      shortcuts(
        () => {
          setBoard(true);
          setTimeout(() => searchRef.current?.focus(), 0);
        },
        () => {
          if (p.compact) setBoard(false);
          setTimeout(() => composerRef.current?.focus(), 0);
        },
      ),
    [p.compact],
  );
  async function perform(action: Action) {
    try {
      return await p.action(action);
    } catch {
      toast.error("연결을 확인하고 다시 보내주세요. 요청은 그대로 보관했어요.");
      throw Error("Unconfirmed request");
    }
  }
  async function create() {
    createId.current ??= makeTaskId();
    try {
      await perform({ action: "create", requestId: createId.current });
      createId.current = null;
      setBoard(false);
    } catch {}
  }
  async function admit(plan: Plan) {
    try {
      await perform({
        action: "approve",
        conversationId: p.conversation,
        planId: plan.id,
        digest: plan.digest,
      });
      toast.show("접수했어요.", { variant: "success" });
    } catch {}
  }
  async function askRetry() {
    if (!retry) return;
    if (retryId.current?.task !== retry.id)
      retryId.current = { task: retry.id, id: makeTaskId() };
    try {
      let conversation = p.conversation;
      if (!conversation)
        conversation = (
          await perform({ action: "create", requestId: makeTaskId() })
        ).conversationId!;
      await perform({
        action: "send",
        conversationId: conversation,
        messageId: retryId.current.id,
        text: "이 작업을 다시 하고 싶어요. 실패 원인을 확인하고 새 계획을 보여주세요.",
        retryOf: retry.id,
      });
      setRetry(null);
      retryId.current = null;
      if (p.compact) setBoard(false);
      toast.show("다시 살펴볼게요.");
    } catch {}
  }
  const queue = p.data?.queue ?? {},
    running =
      (queue.running ?? 0) + (queue.dispatching ?? 0) + (queue.repairing ?? 0),
    waiting = (queue.queued ?? 0) + (queue.ready ?? 0),
    attention = (queue.blocked ?? 0) + (queue.unknown ?? 0);
  const memoryProject =
    p.data?.plans[0]?.tasks[0]?.project ||
    p.data?.tasks.find((t) => t.conversationId === p.conversation)?.project ||
    "";
  const status = p.error
    ? "다시 연결 중"
    : p.loading && !p.data
      ? "연결 중"
      : p.data?.configured && !p.data.managerHealthy
        ? "봇 응답 확인 중"
        : p.data?.stuck
          ? "확인이 필요해요"
        : p.data?.deliveryState
          ? "답변하는 중"
          : running
            ? `${running}개 작업 중`
            : "연결됨";
  const statusGroup = p.error ? "failed" : (p.loading && !p.data) || p.data?.deliveryState || (p.data?.configured && !p.data.managerHealthy) ? "attention" : running ? "running" : "success";
  const statusColors = t.tint(statusTone(statusGroup), 0.14, t.c.surface0);
  return (
    <View
      testID="bot-console"
      style={{
        flex: 1,
        backgroundColor: t.c.surface0,
        padding: p.compact ? 16 : 24,
        gap: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 160, flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.c.accent }}>
            <Glyph name="Bot" size={18} color={t.c.accentForeground} />
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text
              accessibilityRole="header"
              style={{ ...t.heading, fontSize: 20, lineHeight: 26 }}
            >
              Paseo 봇
            </Text>
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: statusColors.background, borderWidth: 1, borderColor: statusColors.border }}>
              <StatusIcon group={statusGroup} color={statusColors.foreground} size={12} />
              <Text style={{ ...t.small, color: statusColors.foreground, fontWeight: "500" }}>{status}</Text>
            </View>
          </View>
        </View>
        <Button
          label="대화 기록"
          icon="History"
          quiet
          iconOnly={p.compact}
          onPress={() => setHistory(true)}
        />
        <Button
          label="새 대화"
          icon="Plus"
          quiet
          iconOnly={p.compact}
          disabled={p.pending || !p.data?.configured || p.error}
          onPress={() => void create()}
        />
        <Button
          label={board ? "작업 닫기" : "작업 보기"}
          icon="Columns3"
          selected={board}
          tone="blue"
          iconOnly={p.compact}
          badge={running || undefined}
          onPress={() => setBoard(!board)}
        />
      </View>
      {p.error && (
        <Notice title="연결을 다시 확인하고 있어요" error>
          <Text style={t.muted}>
            마지막 확인 {relativeTime(p.data?.lastSyncAt ?? 0, now)}. 연결되면
            이어서 보여드릴게요.
          </Text>
          <Button label="다시 연결" onPress={p.refresh} />
        </Notice>
      )}
      {p.data && !p.data.configured && (
        <Notice title="봇을 준비하고 있어요">
          봇 호스트 연결을 확인해 주세요.
        </Notice>
      )}
      <View
        style={{
          flex: 1,
          minHeight: 300,
          flexDirection: p.compact ? "column" : "row",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {(!p.compact || !board) && (
          <View
            testID="main-chat"
            style={{
              flex: 1,
              minWidth: 0,
              width: "100%",
              // Prose measure for daily reading: about 54 Korean characters per line at body size.
              maxWidth: board ? undefined : 760,
              alignSelf: board ? "stretch" : "center",
              height: "100%",
            }}
          >
            {p.loading && !p.data ? (
              <Skeleton label="대화를 불러오는 중" />
            ) : (
              <Chat
                key={p.conversation}
                {...p}
                drafts={drafts.current}
                composerRef={composerRef}
                perform={perform}
                admit={admit}
                memory={(id) => {
                  if (!memoryProject) {
                    toast.show("어느 프로젝트에 기억할지 대화로 알려주세요.");
                    return;
                  }
                  setMemory(id);
                }}
                openTask={(id) => {
                  const row = p.data?.tasks.find((t) => t.id === id);
                  if (row) p.select(row);
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
                    setBoard(true);
                  }
                }}
              />
            )}
          </View>
        )}
        {board && (
          <View
            testID="secondary-board"
            style={{
              flex: p.compact ? 1 : 1.15,
              minWidth: 0,
              gap: 12,
              borderLeftWidth: p.compact ? 0 : 1,
              borderColor: t.c.border,
              paddingLeft: p.compact ? 0 : 20,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {([
                ["waiting", "대기", waiting, "CircleDashed"],
                ["running", "진행", running, "LoaderCircle"],
                // Five tiles must share one row on a phone, so the label is shortened there.
                ["attention", p.compact ? "검토" : "검토 필요", attention, "CircleAlert"],
                ["success", "완료", queue.passed ?? 0, "CircleCheck"],
                ["failed", "실패", queue.failed ?? 0, "CircleX"],
              ] as const).map(([group, label, n, icon]) => {
                const on = p.filters.group === group, colors = t.tint(statusTone(group), on ? 0.26 : 0.12, t.c.surface0);
                return (
                <Pressable
                  key={group}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${n}개${on ? ", 필터 해제" : ", 필터"}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => p.setFilters({ group: on ? "" : group, offset: 0 })}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                    flex: 1,
                    minWidth: p.compact ? 0 : 72,
                    minHeight: 44,
                    paddingHorizontal: p.compact ? 8 : 12,
                    paddingVertical: 8,
                    gap: 2,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: on ? toneInk(statusTone(group)) : colors.border,
                    backgroundColor: colors.background,
                    transform: [{ translateY: hovered && !pressed ? -2 : 0 }, { scale: pressed ? 0.97 : 1 }],
                    ...t.shadow(!!hovered),
                  })}
                >
                  <View style={{ flexDirection: "row", gap: p.compact ? 4 : 6, alignItems: "center" }}>
                    <Glyph name={icon} size={13} color={colors.foreground} />
                    <Text numberOfLines={1} style={{ ...t.small, color: colors.foreground }}>{label}</Text>
                  </View>
                  <Text style={{ ...t.heading, fontSize: 20, lineHeight: 26, color: colors.foreground }}>{n}</Text>
                </Pressable>
              );})}
            </View>
            <Text style={t.small}>
              {p.data?.host || "봇 호스트"} · {p.data?.healthy ? "정상" : "확인 필요"} · 마지막 응답{" "}
              {relativeTime(p.data?.lastTickAt ?? 0, now)}
            </Text>
            <Board
              data={p.data}
              loading={p.loading}
              filters={p.filters}
              setFilters={p.setFilters}
              view={view}
              setView={setView}
              open={p.select}
              retry={setRetry}
              searchRef={searchRef}
              conversation={p.conversation}
              now={now}
            />
          </View>
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
      <Modal title="대화 기록" open={history} onOpenChange={setHistory}>
        <Modal.Content>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {(p.data?.conversations ?? []).map((c) => (
              <Button
                key={c.id}
                label={c.title}
                selected={c.id === p.conversation}
                onPress={() => {
                  p.setConversation(c.id);
                  setHistory(false);
                  if (p.compact) setBoard(false);
                }}
              />
            ))}
          </ScrollView>
        </Modal.Content>
      </Modal>
      {retry && (
        <Modal
          title="다시 해 볼까요?"
          open
          onOpenChange={(open) => {
            if (!open) setRetry(null);
          }}
        >
          <Modal.Content>
            <Text style={t.heading}>{retry.title}</Text>
            <Text style={t.body}>
              실패 원인을 살펴보고 새 계획을 보여드릴게요. 기존 작업은 그대로
              남겨둘게요.
            </Text>
            <Button
              label="새 계획 요청"
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
          title="기억해 둘까요?"
          open
          onOpenChange={(open) => {
            if (!open) setMemory(null);
          }}
        >
          <Modal.Content>
            <Text style={t.body}>
              {memoryProject}의 참고 기록으로 남겨둘게요.
            </Text>
            <Button
              label="기억하기"
              primary
              disabled={p.pending}
              onPress={() => {
                void perform({
                  action: "remember",
                  conversationId: p.conversation,
                  messageId: memory,
                  project: memoryProject,
                })
                  .then(() => {
                    setMemory(null);
                    toast.show("기억해 뒀어요.");
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
