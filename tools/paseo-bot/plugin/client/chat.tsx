import { useEffect, useRef, useState, type RefObject } from "react";
import { Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { ScrollView, Text, TextInput, View } from "react-native";
import type { Action, Plan } from "../shared/contracts";
import { makeTaskId } from "../shared/model";
import type { Props, ActionResult } from "./screen";
import { Button, Empty, Glyph, Notice, Select, useUi } from "./ui";
import { composerKeys } from "./web";
export type DraftState={draft:string;project:string;request:{id:string;text:string}|null;y:number;bottom:boolean;problem:string};
export function Chat(
  p: Props & {
    composerRef: RefObject<TextInput | null>;
    perform: (i: Action) => Promise<ActionResult>;
    confirm: (p: Plan) => void;
    memory: (id: string) => void;
    create: () => Promise<void>;
    openTask: (id: string) => void;
    drafts: Map<string,DraftState>;
  },
) {
  const t = useUi(),
    toast = useToast(),
    [draft, setDraft] = useState(p.drafts.get(p.conversation)?.draft??""),
    [project, setProject] = useState(p.drafts.get(p.conversation)?.project??""),
    [problem, setProblem] = useState(p.drafts.get(p.conversation)?.problem??"");
  const request = useRef<{ id: string; text: string } | null>(p.drafts.get(p.conversation)?.request??null),
    busy = useRef(false),
    scroll = useRef<ScrollView>(null),
    atBottom = useRef(p.drafts.get(p.conversation)?.bottom??true),
    [unread, setUnread] = useState(false);
  const position=useRef(p.drafts.get(p.conversation)?.y??0),restored=useRef(false);
  const latest=useRef({draft,project,problem});latest.current={draft,project,problem};
  useEffect(()=>()=>{p.drafts.set(p.conversation,{...latest.current,request:request.current,y:position.current,bottom:atBottom.current});},[]);
  const messages = p.data?.messages ?? [],
    plan = p.data?.plans.find((p) => p.state === "pending");
  useEffect(() => {
    if (atBottom.current) scroll.current?.scrollToEnd({ animated: false });
    else setUnread(true);
  }, [messages.length]);
  async function send() {
    if (
      busy.current ||
      p.pending ||
      !draft.trim() ||
      !p.conversation ||
      p.error
    )
      return;
    const text = project
      ? `[프로젝트: ${project}]\n${draft.trim()}`
      : draft.trim();
    request.current ??= { id: makeTaskId(), text };
    busy.current = true;
    setProblem("");
    try {
      await p.perform({
        action: "send",
        conversationId: p.conversation,
        messageId: request.current.id,
        text: request.current.text,
      });
      request.current = null;
      setDraft("");
      atBottom.current = true;
      toast.show("봇에게 요청을 전달했습니다.");
    } catch {
      setProblem(
        "전달 여부를 확인하지 못했습니다. 초안을 보존했습니다. 다시 보내면 같은 요청 ID를 사용합니다.",
      );
    } finally {
      busy.current = false;
    }
  }
  useEffect(
    () => composerKeys(() => void send()),
    [draft, project, p.pending, p.error, p.conversation],
  );
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        testID="chat-history"
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 20 }}
        onScroll={(e) => {
          const n = e.nativeEvent;
          position.current=n.contentOffset.y;
          atBottom.current =
            n.contentOffset.y + n.layoutMeasurement.height >=
            n.contentSize.height - 60;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={()=>{if(!restored.current){restored.current=true;if(atBottom.current)scroll.current?.scrollToEnd({animated:false});else scroll.current?.scrollTo({y:position.current,animated:false});}}}
      >
        {messages.length===100&&<Button label="이전 대화 보기" onPress={()=>p.setFilters({before:messages[0].time})}/>}
        {p.filters.before!==undefined&&<Button label="최근 대화로 돌아가기" onPress={()=>p.setFilters({before:undefined})}/>}
        {!p.conversation ? (
          <Empty
            title="무엇을 도와드릴까요?"
            body="개발 요청을 알려주시면 봇이 필요한 내용을 확인하고 작업 계획을 제안합니다."
            action={
              <Button
                label="대화 시작"
                primary
                onPress={() => void p.create()}
                disabled={p.pending || !p.data?.configured}
              />
            }
          />
        ) : messages.length === 0 ? (
          <Empty
            title="요청을 편하게 말씀해 주세요"
            body="프로젝트나 작업 범위가 모호하면 봇이 먼저 질문합니다. 계획을 확인하기 전에는 실행하지 않습니다."
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
                  {m.role === "user"
                    ? "실장님"
                    : m.role === "assistant"
                      ? "Paseo 봇"
                      : "작업 알림"}
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
                  {m.payload.taskIds.map((id) => (
                    <Button
                      key={id}
                      label={`작업 보기 · ${id}`}
                      icon="ArrowUpRight"
                      quiet
                      onPress={() => p.openTask(id)}
                    />
                  ))}
                </View>
              )}
              {m.role === "assistant" && (
                <View style={{ alignItems: "flex-start" }}>
                  <Button
                    label="이 답변 기억하기"
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
          <View
            testID="plan-card"
            style={{
              ...t.panel,
              padding: 16,
              gap: 12,
              borderColor: t.c.accent,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Glyph name="ListChecks" />
              <Text style={t.heading}>작업 계획 · {plan.tasks.length}건</Text>
            </View>
            {plan.tasks.map((task, i) => (
              <View key={i} style={{ gap: 4 }}>
                <Text style={t.body}>
                  {i + 1}. {task.title}
                </Text>
                <Text style={t.small}>
                  {task.project} · {task.machine || "자동 배정"}
                </Text>
              </View>
            ))}
            <Text style={t.small}>내용을 확인하면 큐에 접수합니다.</Text>
            <Button
              label="계획 확인"
              primary
              onPress={() => p.confirm(plan)}
              disabled={p.pending || p.error}
            />
          </View>
        )}
        {!!p.data?.deliveryState && (
          <Notice
            title={
              p.data.deliveryState === "unknown"
                ? "전달 확인이 필요합니다"
                : "봇이 답변을 준비하고 있습니다"
            }
          >
            {p.data.deliveryState === "unknown"
              ? "중복 전송을 막기 위해 자동으로 다시 보내지 않았습니다. VAXPORT의 매니저 기록을 확인해 주세요."
              : "답변이 오면 이 대화에 표시합니다."}
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
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Select
            label="프로젝트"
            value={project}
            options={[
              { value: "", label: "봇과 정하기" },
              ...(p.data?.projects ?? [])
                .filter((p) => p.enabled)
                .map((p) => ({ value: p.id, label: p.id })),
            ]}
            onChange={setProject}
            disabled={!!request.current}
          />
          <Select
            label="템플릿"
            value=""
            options={[
              { value: "", label: "선택" },
              { value: "bug", label: "버그 수정" },
              { value: "feature", label: "기능 추가" },
              { value: "refactor", label: "리팩터링" },
              { value: "check", label: "상태 확인" },
            ]}
            onChange={(v) =>
              setDraft(
                (
                  {
                    bug: "이 문제를 재현하고 수정해 주세요.\n문제 현상: \n기대 동작: ",
                    feature:
                      "새 기능을 만들고 싶습니다.\n원하는 동작: \n완료 기준: ",
                    refactor:
                      "동작을 유지하면서 구조를 정리해 주세요.\n대상: \n개선할 점: ",
                    check:
                      "이 프로젝트의 현재 상태와 확인할 사항을 알려주세요.",
                  } as Record<string, string>
                )[v] ?? draft,
              )
            }
            disabled={!!request.current}
          />
        </View>
        <TextInput
          ref={p.composerRef}
          testID="bot-composer"
          accessibilityLabel="봇에게 요청하기"
          multiline
          value={draft}
          onChangeText={setDraft}
          maxLength={11500}
          editable={!p.pending && !request.current}
          placeholder="봇에게 요청하세요. 필요한 내용은 함께 정리합니다."
          placeholderTextColor={t.c.foregroundMuted}
          style={{
            ...t.body,
            minHeight: 96,
            maxHeight: 180,
            borderWidth: 1,
            borderColor: t.c.border,
            borderRadius: 12,
            padding: 12,
            textAlignVertical: "top",
            backgroundColor: t.c.surface0,
          }}
        />
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
            disabled={p.pending || !draft.trim() || !p.conversation || p.error}
          />
        </View>
      </View>
    </View>
  );
}
