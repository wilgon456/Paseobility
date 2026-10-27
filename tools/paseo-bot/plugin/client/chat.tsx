import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalLink, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Action, Plan, Selection, Workflow } from "../shared/contracts";
import { makeTaskId, modelAlias, modelLabel, models, profileLabel, safePr } from "../shared/model";
import type { Props, ActionResult } from "./screen";
import { Button, Empty, Glyph, MotionIn, Notice, Segmented, Select, StatusIcon, Tag, useReducedMotion, useUi, type Option } from "./ui";
import { composerKeys } from "./web";
import { defaultSelection, starters, workflowLabel, workflows } from "./workflow";
import { projectTone, modelTone, effortTone, toneInk } from "../shared/colors";
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
    admit: (p: Plan) => Promise<void>;
    memory: (id: string) => void;
    openTask: (id: string) => void;
    drafts: Map<string, DraftState>;
  },
) {
  const t = useUi(),
    toast = useToast();
  const cached = p.drafts.get(p.conversation);
  const [selection, setSelection] = useState<Selection>({ ...defaultSelection, ...cached?.selection });
  const [draft, setDraft] = useState(cached?.draft ?? ""),
    [problem, setProblem] = useState(cached?.problem ?? "");
  const request = useRef<Request | null>(cached?.request ?? null),
    busy = useRef(false),
    scroll = useRef<ScrollView>(null);
  const atBottom = useRef(cached?.bottom ?? true),
    position = useRef(cached?.y ?? 0),
    restored = useRef(false);
  const [unread, setUnread] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [composerFocus, setComposerFocus] = useState(false);
  const acceptGuard = useRef(false);
  const planMotion = useRef(new Animated.Value(1)).current;
  const detailMotion = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
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
  useEffect(() => { setPlanExpanded(false); detailMotion.setValue(0); }, [plan?.id, detailMotion]);
  useEffect(() => () => { planMotion.stopAnimation(); detailMotion.stopAnimation(); }, [planMotion, detailMotion]);
  function toggleDetails() {
    const next = !planExpanded;
    detailMotion.stopAnimation();
    if (next) setPlanExpanded(true);
    if (reducedMotion) { detailMotion.setValue(next ? 1 : 0); if (!next) setPlanExpanded(false); return; }
    Animated.timing(detailMotion, { toValue: next ? 1 : 0, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished && !next) setPlanExpanded(false); });
  }
  async function acceptPlan(value: Plan) {
    if (acceptGuard.current) return;
    acceptGuard.current = true; setAccepting(true);
    const proceed = async () => { try { await p.admit(value); } finally { planMotion.setValue(1); acceptGuard.current = false; setAccepting(false); } };
    if (reducedMotion) { await proceed(); return; }
    Animated.timing(planMotion, { toValue: .4, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) void proceed(); else { acceptGuard.current = false; setAccepting(false); } });
  }
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
  const projectIds = (p.data?.projects ?? []).map(x => x.id);
  const modelOptions: Option[] = [
    { value: "auto", label: "자동", note: "작업에 맞춰 Sol·Opus·Flash 중 선택", tone: "gray" },
    ...(Object.entries(models) as [keyof typeof models, (typeof models)[keyof typeof models]][]).map(([value, info]) => ({ value, label: info.label, note: info.note, tone: modelTone(value) })),
  ];
  const effortOptions: Option[] = [
    { value: "auto", label: "자동", note: "모델 기본값 (Sol은 high)", tone: "gray" },
    { value: "low", label: "Low", note: "빠르게", tone: effortTone("low") },
    { value: "medium", label: "Medium", note: "균형", tone: effortTone("medium") },
    { value: "high", label: "High", note: "깊게 생각", tone: effortTone("high") },
  ];
  const disabledSelect = !!request.current;
  const mine = t.tint(t.c.accent, 0.12, t.c.surface0), done = t.tint("green", 0.12, t.c.surface0);
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        testID="chat-history"
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: p.compact ? 0 : 12, gap: 20 }}
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
            icon="Bot"
            tone="gray"
            title="무엇을 도와드릴까요?"
            body="글과 답변은 대화에서 바로 답해요. 코드는 계획을 보여드리고, 접수하면 작업으로 진행한 뒤 결과를 알려드려요."
            action={
              <View testID="starters" style={{ alignSelf: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
                {starters.map((s) => (
                  <Starter
                    key={s.id}
                    icon={s.icon}
                    title={s.title}
                    note={s.note}
                    disabled={p.pending || !!request.current}
                    onPress={() => {
                      setDraft(s.template);
                      p.composerRef.current?.focus();
                    }}
                  />
                ))}
              </View>
            }
          />
        ) : (
          messages.map((m) => {
            const time = new Date(m.time * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            if (m.role === "user") return (
              <MotionIn key={m.id} motionKey={m.id}>
                <View style={{ alignSelf: "flex-end", maxWidth: "88%", gap: 4, alignItems: "flex-end" }}>
                  <Text style={t.small}>실장님 · {time}</Text>
                  <View style={{ backgroundColor: mine.background, borderWidth: 1, borderColor: mine.border, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, borderBottomRightRadius: 4 }}>
                    <Text selectable style={t.body}>{m.text}</Text>
                  </View>
                </View>
              </MotionIn>
            );
            if (m.role === "system") return (
              <MotionIn key={m.id} motionKey={m.id}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: done.background, borderWidth: 1, borderColor: done.border }}>
                    <StatusIcon group={m.payload.taskIds?.length ? "success" : "waiting"} color={done.foreground} size={14} />
                    <Text selectable style={{ ...t.small, color: done.foreground, fontWeight: "500" }}>{m.text}</Text>
                  </View>
                  {!!m.payload.taskIds?.length && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                      {m.payload.taskIds.map((id, i) => (
                        <Button
                          key={id}
                          label={m.payload.taskIds!.length === 1 ? "작업 자세히 보기" : `작업 ${i + 1} 보기`}
                          icon="ArrowUpRight"
                          quiet
                          onPress={() => p.openTask(id)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </MotionIn>
            );
            return (
              <MotionIn key={m.id} motionKey={m.id}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                  <View style={{ width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: t.c.accent }}>
                    <Glyph name="Bot" size={16} color={t.c.accentForeground} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ ...t.small, color: t.c.foreground, fontWeight: "600" }}>Paseo 봇</Text>
                      <Text style={t.small}>{time}</Text>
                    </View>
                    <Markdown>{m.text}</Markdown>
                    {!!m.payload.taskIds?.length && m.payload.taskIds.map((id, i) => (
                      <Button key={id} label={m.payload.taskIds!.length === 1 ? "작업 자세히 보기" : `작업 ${i + 1} 보기`} icon="ArrowUpRight" quiet onPress={() => p.openTask(id)} />
                    ))}
                    {!!safePr(m.payload.prUrl) && (
                      <ExternalLink href={safePr(m.payload.prUrl)}>PR 자세히 보기</ExternalLink>
                    )}
                    <View style={{ alignItems: "flex-start", marginLeft: -12 }}>
                      <Button label="기억하기" quiet icon="Bookmark" onPress={() => p.memory(m.id)} />
                    </View>
                  </View>
                </View>
              </MotionIn>
            );
          })
        )}
        {plan && plan.tasks.length > 0 && (() => {
          const first = plan.tasks[0];
          const model = (task: typeof first, compact = false) => task.resolvedModel ? modelLabel(task.resolvedModel, compact) : profileLabel(task.kind);
          const effort = (task: typeof first) => task.effort && task.effort !== "auto" ? task.effort : task.workflow === "daily" ? "medium (자동)" : (modelAlias(task.resolvedModel ?? "") === "sol" ? "high (자동)" : "자동");
          const frame = t.tint(t.c.accent, 0.06, t.c.surface0);
          return (
            <MotionIn motionKey={plan.id}>
            <Animated.View testID="plan-card" style={{ backgroundColor: frame.background, borderWidth: 1, borderColor: t.tint(t.c.accent, 0.4, t.c.surface0).background, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 8, minWidth: 0, opacity: planMotion, transform: [{ scale: planMotion.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }], ...t.shadow() }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Glyph name="ListChecks" size={16} color={t.c.accent} />
                <Text numberOfLines={1} style={{ ...t.body, flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "700" }}>이렇게 진행할게요</Text>
                  <Text style={{ color: t.c.foregroundMuted }}>{"  "}{first.title}{plan.tasks.length > 1 ? ` 외 ${plan.tasks.length - 1}개` : ""}</Text>
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 4 }}>
                <Tag dot surface={frame.background} label={first.project} maxWidth={p.compact ? 96 : 200} tone={projectTone(first.project, projectIds)} />
                <Tag dot surface={frame.background} label={model(first, p.compact)} tone={modelTone(first.resolvedModel || first.kind)} />
                <Tag surface={frame.background} label={`effort ${p.compact ? effort(first).replace(" (자동)", "") : effort(first)}`} tone={effortTone(effort(first))} />
                {!!first.workflow && <Tag surface={frame.background} label={workflowLabel(first.workflow)} tone={workflows[first.workflow].tone} />}
                {plan.tasks.length > 1 && <Tag surface={frame.background} label={`${plan.tasks.length}단계`} tone="cyan" />}
                <Tag surface={frame.background} label={first.modelReason === "일반 작업 기본 모델" && p.compact ? "기본 작업" : first.modelReason || "자동 배정"} tone="gray" />
              </ScrollView>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Button label={accepting ? "접수 중" : "접수"} icon="Check" primary onPress={() => void acceptPlan(plan)} disabled={accepting || p.pending || p.error || !p.data?.acceptsTasks} />
                <Button label="수정" quiet icon="PencilLine" onPress={() => void (async () => {
                  try {
                    await p.perform({ action: "reject", conversationId: p.conversation, planId: plan.id });
                    p.composerRef.current?.focus();
                    toast.show("바꿀 내용을 알려주세요.");
                  } catch {}
                })()} disabled={accepting || p.pending || p.error} />
                <View style={{ flex: 1 }} />
                <Button label={planExpanded ? "상세 접기" : "상세 펼치기"} quiet icon={planExpanded ? "ChevronUp" : "ChevronDown"} onPress={toggleDetails} />
              </View>
              {planExpanded && (
                <Animated.View testID="plan-details" style={{ borderTopWidth: 1, borderColor: t.c.border, paddingTop: 8, gap: 12, opacity: detailMotion, transform: [{ translateY: detailMotion.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
                  {plan.tasks.map((task, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                      <View style={{ width: 22, height: 22, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: toneInk(projectTone(task.project, projectIds)) }}>
                        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#ffffff" }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={t.body}>{task.title}</Text>
                        <Text style={t.small}>{task.project} · {task.machine || "프로젝트 기본 머신"} · {model(task)} · {effort(task)}{task.workflow ? ` · ${workflowLabel(task.workflow)}` : ""}</Text>
                        {!!task.modelReason && <Text style={t.small}>{task.modelReason}</Text>}
                      </View>
                    </View>
                  ))}
                </Animated.View>
              )}
            </Animated.View>
            </MotionIn>
          );
        })()}
        {p.data?.stuck ? (
          // The service never resolves these by itself: the operator decides here.
          <Notice
            tone="yellow"
            icon="ShieldCheck"
            title={p.data.stuck === "manager-missing" ? "매니저 봇을 찾지 못했어요" : "이전 요청을 확인하지 못했어요"}
          >
            <Text style={t.muted}>
              {p.data.stuck === "manager-missing"
                ? "대화 내용은 그대로 두고 새 매니저로 이어갈 수 있어요."
                : "중복 실행을 막으려고 멈춰 뒀어요. 다음 요청은 이 요청을 정리한 뒤 보낼게요."}
            </Text>
            <Button
              label={p.data.stuck === "manager-missing" ? "매니저 다시 시작" : "이 요청 버리고 계속하기"}
              disabled={p.pending}
              onPress={() => void p.perform({ action: "resolve", conversationId: p.conversation }).catch(() => {})}
            />
          </Notice>
        ) : !!p.data?.deliveryState && (
          <Notice tone="purple" icon="Sparkles" title="생각하고 있어요">
            곧 여기서 답해드릴게요.
          </Notice>
        )}
      </ScrollView>
      {unread && (
        <Button
          label="새 메시지 보기"
          icon="ArrowDown"
          tone="blue"
          round
          onPress={() => {
            atBottom.current = true;
            setUnread(false);
            scroll.current?.scrollToEnd({ animated: false });
          }}
        />
      )}
      <View style={{ paddingTop: 12, gap: 8 }}>
        {!!problem && (
          <Text accessibilityRole="alert" style={{ ...t.small, color: t.tint("red", 0.12).foreground }}>
            {problem}
          </Text>
        )}
        <View testID="composer" style={{ backgroundColor: t.c.surface1, borderWidth: 1, borderColor: composerFocus ? t.c.accent : t.c.border, borderRadius: 14, padding: 8, gap: 4, ...t.shadow(composerFocus) }}>
          <TextInput
            ref={p.composerRef}
            testID="bot-composer"
            accessibilityLabel="봇에게 요청하기"
            multiline
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setComposerFocus(true)}
            onBlur={() => setComposerFocus(false)}
            maxLength={11500}
            editable={!p.pending && !request.current}
            placeholder="무엇을 해 드릴까요?"
            placeholderTextColor={t.c.foregroundMuted}
            style={{
              ...t.body,
              minHeight: 64,
              maxHeight: 180,
              paddingHorizontal: 8,
              paddingVertical: 6,
              textAlignVertical: "top",
              // Web: the container shows focus; avoid a second ring inside it.
              outlineStyle: "none",
              // Web: grow with the text between minHeight and maxHeight (native multiline inputs already do).
              fieldSizing: "content",
            } as object}
          />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Segmented
                label="진행 방식"
                value={selection.workflow ?? defaultSelection.workflow!}
                disabled={disabledSelect}
                options={(Object.keys(workflows) as Workflow[]).map((value) => ({ value, label: workflows[value].label, icon: workflows[value].icon, tone: workflows[value].tone }))}
                onChange={(workflow) => setSelection({ ...selection, workflow: workflow as Workflow })}
              />
              <Select icon="FolderGit2" tone={selection.project === "auto" ? "gray" : projectTone(selection.project, projectIds)} label="프로젝트" value={selection.project} disabled={disabledSelect} options={[{ value: "auto", label: "자동", note: "대화 내용으로 선택", tone: "gray" }, ...(p.data?.projects ?? []).filter(x => x.enabled).map(x => ({ value: x.id, label: x.id, tone: projectTone(x.id, projectIds) }))]} onChange={(project) => setSelection({ ...selection, project })} />
              <Select icon="Cpu" tone={modelTone(selection.model)} label="모델" value={selection.model} disabled={disabledSelect} options={modelOptions} onChange={(model) => setSelection({ ...selection, model: model as Selection["model"] })} />
              <Select icon="Gauge" tone={effortTone(selection.effort)} label="effort" value={selection.effort} disabled={disabledSelect} options={effortOptions} onChange={(effort) => setSelection({ ...selection, effort: effort as Selection["effort"] })} />
            </View>
            <Button
              label={p.pending ? "전달 중" : "보내기"}
              primary
              round
              iconOnly
              icon={p.pending ? "LoaderCircle" : "ArrowUp"}
              onPress={() => void send()}
              disabled={p.pending || !draft.trim() || p.error || !p.data?.configured}
            />
          </View>
        </View>
        <View style={{ gap: 2, paddingHorizontal: 4 }}>
          <Text testID="workflow-note" style={t.small}>{workflows[selection.workflow ?? defaultSelection.workflow!].detail}</Text>
          <Text style={t.small}>Enter 전송 · Shift+Enter 줄바꿈 · 모델·effort는 접수된 코딩 작업에 적용돼요</Text>
        </View>
      </View>
    </View>
  );
}
function Starter({ icon, title, note, disabled, onPress }: { icon: string; title: string; note: string; disabled: boolean; onPress: () => void }) {
  const t = useUi();
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        ...t.panel,
        ...t.shadow(hover && !disabled),
        flex: 1,
        minWidth: 200,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 2,
        borderColor: focus ? t.c.accent : t.c.border,
        backgroundColor: pressed ? t.c.surface2 : t.c.surface1,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Glyph name={icon} size={16} color={t.c.foreground} />
        <Text style={{ ...t.body, fontWeight: "600" }}>{title}</Text>
      </View>
      <Text style={t.small}>{note}</Text>
    </Pressable>
  );
}
