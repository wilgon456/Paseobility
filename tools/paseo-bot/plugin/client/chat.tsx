import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalLink, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { ScrollView, Text, TextInput, View } from "react-native";
import type { Action, Plan, Selection } from "../shared/contracts";
import { makeTaskId, profileLabel, safePr } from "../shared/model";
import type { Props, ActionResult } from "./screen";
import { Button, Empty, Glyph, Notice, Select, useUi } from "./ui";
import { composerKeys } from "./web";
type Request = { id: string; text: string; selection: Selection; conversationId?: string };
export type DraftState = {
  draft: string;
  request: Request | null;
  y: number;
  bottom: boolean;
  problem: string;
  selection: Selection;
};
export function Chat(
  p: Props & {
    composerRef: RefObject<TextInput | null>;
    perform: (i: Action) => Promise<ActionResult>;
    admit: (p: Plan) => void;
    memory: (id: string) => void;
    openTask: (id: string) => void;
    drafts: Map<string, DraftState>;
  },
) {
  const t = useUi(),
    toast = useToast();
  const cached = p.drafts.get(p.conversation);
  const [selection, setSelection] = useState<Selection>(cached?.selection ?? {project:"auto",model:"auto",effort:"auto"});
  const [draft, setDraft] = useState(cached?.draft ?? ""),
    [problem, setProblem] = useState(cached?.problem ?? "");
  const request = useRef<Request | null>(cached?.request ?? null),
    busy = useRef(false),
    scroll = useRef<ScrollView>(null);
  const atBottom = useRef(cached?.bottom ?? true),
    position = useRef(cached?.y ?? 0),
    restored = useRef(false);
  const [unread, setUnread] = useState(false);
  const latest = useRef({ draft, problem, selection });
  latest.current = { draft, problem, selection };
  useEffect(
    () => () => {
      p.drafts.set(p.conversation, {
        ...latest.current,
        request: request.current,
        y: position.current,
        bottom: atBottom.current,
      });
    },
    [],
  );
  const messages = p.data?.messages ?? [],
    plan = p.data?.plans.find((p) => p.state === "pending");
  useEffect(() => {
    if (atBottom.current) scroll.current?.scrollToEnd({ animated: false });
    else setUnread(true);
  }, [messages.length, plan?.id, p.data?.deliveryState]);
  async function send() {
    if (
      busy.current ||
      p.pending ||
      !draft.trim() ||
      p.error ||
      !p.data?.configured
    )
      return;
    request.current ??= {
      id: makeTaskId(),
      text: draft.trim(),
      selection,
      ...(!p.conversation ? { conversationId: makeTaskId() } : {}),
    };
    busy.current = true;
    setProblem("");
    try {
      const r = request.current;
      await p.perform(
        r.conversationId
          ? {
              action: "start",
              requestId: r.conversationId,
              messageId: r.id,
              text: r.text,
              selection: r.selection,
            }
          : {
              action: "send",
              conversationId: p.conversation,
              messageId: r.id,
              text: r.text,
              selection: r.selection,
            },
      );
      request.current = null;
      setDraft("");
      p.drafts.delete(p.conversation);
      atBottom.current = true;
      toast.show("전달했어요.");
    } catch {
      setProblem(
        "전달 여부를 확인하지 못했어요. 다시 보내도 같은 요청으로 처리해요.",
      );
    } finally {
      busy.current = false;
    }
  }
  useEffect(
    () => composerKeys(() => void send()),
    [draft, p.pending, p.error, p.conversation, p.data?.configured],
  );
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        testID="chat-history"
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
        onScroll={(e) => {
          const n = e.nativeEvent;
          position.current = n.contentOffset.y;
          atBottom.current =
            n.contentOffset.y + n.layoutMeasurement.height >=
            n.contentSize.height - 60;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (!restored.current) {
            restored.current = true;
            if (atBottom.current)
              scroll.current?.scrollToEnd({ animated: false });
            else
              scroll.current?.scrollTo({
                y: position.current,
                animated: false,
              });
          }
        }}
      >
        {messages.length === 100 && (
          <Button
            label="이전 대화 보기"
            onPress={() => p.setFilters({ before: messages[0].time })}
          />
        )}
        {p.filters.before !== undefined && (
          <Button
            label="최근 대화로 돌아가기"
            onPress={() => p.setFilters({ before: undefined })}
          />
        )}
        {messages.length === 0 ? (
          <Empty
            title="무엇을 도와드릴까요?"
            body="하고 싶은 일을 편하게 말씀해 주세요. 계획을 보여드리고, 접수하면 시작할게요."
          />
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={{
                gap: 8,
                padding: m.role === "user" ? 12 : 0,
                borderRadius: 12,
                backgroundColor:
                  m.role === "user" ? t.c.surface2 : "transparent",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{
                    ...t.small,
                    color: t.c.foreground,
                    fontWeight: "600",
                  }}
                >
                  {m.role === "user" ? "실장님" : "Paseo 봇"}
                </Text>
                <Text style={t.small}>
                  {new Date(m.time * 1000).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              {m.role === "assistant" ? (
                <Markdown>{m.text}</Markdown>
              ) : (
                <Text selectable style={m.role === "system" ? t.muted : t.body}>
                  {m.text}
                </Text>
              )}
              {!!m.payload.taskIds?.length && (
                <View style={{ gap: 4 }}>
                  {m.payload.taskIds.map((id, i) => (
                    <Button
                      key={id}
                      label={
                        m.payload.taskIds!.length === 1
                          ? "작업 자세히 보기"
                          : `작업 ${i + 1} 보기`
                      }
                      icon="ArrowUpRight"
                      quiet
                      onPress={() => p.openTask(id)}
                    />
                  ))}
                </View>
              )}
              {!!safePr(m.payload.prUrl) && (
                <ExternalLink href={safePr(m.payload.prUrl)}>
                  PR 자세히 보기
                </ExternalLink>
              )}
              {m.role === "assistant" && (
                <View style={{ alignItems: "flex-start" }}>
                  <Button
                    label="기억하기"
                    quiet
                    icon="Bookmark"
                    onPress={() => p.memory(m.id)}
                  />
                </View>
              )}
            </View>
          ))
        )}
        {plan && (
          <View testID="plan-card" style={{ ...t.panel, padding: 16, gap: 12 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Glyph name="ListChecks" />
              <Text style={t.heading}>이렇게 진행할게요</Text>
            </View>
            {plan.tasks.map((task, i) => (
              <View key={i} style={{ gap: 4 }}>
                <Text style={t.body}>
                  {plan.tasks.length > 1 ? `${i + 1}. ` : ""}
                  {task.title}
                </Text>
                <Text style={t.small}>
                  {task.project} · {task.machine || "프로젝트 기본 머신"} ·{" "}
                  {task.resolvedModel ? ({terra:"GPT-6.1 Terra",sol:"GPT-6.1 Sol",claude:"Claude Fable",go:"OpenCode Go"}[task.resolvedModel]) : profileLabel(task.kind)} · {task.effort === "auto" || !task.effort ? (task.resolvedModel === "terra" || task.resolvedModel === "sol" ? "high (자동)" : "자동 effort") : task.effort}
                </Text>
                {!!task.modelReason && <Text style={t.small}>{task.modelReason}</Text>}

              </View>
            ))}
            <Button
              label="접수"
              primary
              onPress={() => p.admit(plan)}
              disabled={p.pending || p.error || !p.data?.acceptsTasks}
            />
          </View>
        )}
        {!!p.data?.deliveryState && (
          <Notice
            title={
              p.data.deliveryState === "unknown"
                ? "전달을 확인하고 있어요"
                : "생각하고 있어요"
            }
          >
            {p.data.deliveryState === "unknown"
              ? "중복 요청을 막기 위해 기록을 확인할게요."
              : "곧 여기서 답해드릴게요."}
          </Notice>
        )}
      </ScrollView>
      {unread && (
        <Button
          label="새 메시지 보기"
          icon="ArrowDown"
          onPress={() => {
            atBottom.current = true;
            setUnread(false);
            scroll.current?.scrollToEnd({ animated: false });
          }}
        />
      )}
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderColor: t.c.border,
          gap: 8,
        }}
      >
        {!!problem && (
          <Text accessibilityRole="alert" style={t.muted}>
            {problem}
          </Text>
        )}
        <View style={{...t.panel, backgroundColor:t.c.surface0, padding:8, gap:8}}>
        <TextInput
          ref={p.composerRef}
          testID="bot-composer"
          accessibilityLabel="봇에게 요청하기"
          multiline
          value={draft}
          onChangeText={setDraft}
          maxLength={11500}
          editable={!p.pending && !request.current}
          placeholder="무엇을 해 드릴까요?"
          placeholderTextColor={t.c.foregroundMuted}
          style={{
            ...t.body,
            minHeight: 96,
            maxHeight: 180,
            padding: 12,
            textAlignVertical: "top",
          }}
        />
        <View style={{flexDirection:"row", flexWrap:"wrap", gap:8}}>
          <Select label="프로젝트" value={selection.project} disabled={!!request.current} options={[{value:"auto",label:"자동"}, ...(p.data?.projects ?? []).filter(x=>x.enabled).map(x=>({value:x.id,label:x.id}))]} onChange={(project)=>setSelection({...selection,project})} />
          <Select label="모델" value={selection.model} disabled={!!request.current} options={[{value:"auto",label:"자동"},{value:"terra",label:"GPT-6.1 Terra"},{value:"sol",label:"GPT-6.1 Sol"},{value:"claude",label:"Claude Fable"},{value:"go",label:"OpenCode Go"}]} onChange={(model)=>setSelection({...selection,model:model as Selection["model"]})} />
          <Select label="effort" value={selection.effort} disabled={!!request.current} options={[{value:"auto",label:"자동"},{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"}]} onChange={(effort)=>setSelection({...selection,effort:effort as Selection["effort"]})} />
        </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={t.small}>Enter 전송 · Shift+Enter 줄바꿈</Text>
          <Button
            label={p.pending ? "전달 중" : "보내기"}
            primary
            icon="ArrowUp"
            onPress={() => void send()}
            disabled={
              p.pending || !draft.trim() || p.error || !p.data?.configured
            }
          />
        </View>
      </View>
    </View>
  );
}
