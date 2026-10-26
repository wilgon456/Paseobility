import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { statusRpc, resultRpc, submitRpc, taskSchema } from "../shared/contracts";
import type { Snapshot, Task } from "../shared/contracts";
import { makeTaskId, stateLabel } from "../shared/model";

export function BotScreen(props: PluginScreenProps) { return <Connected key={props.host.id} {...props} />; }
function Connected({ theme, host, layout }: PluginScreenProps) {
  const read = useRpc(statusRpc), result = useRpc(resultRpc), submit = useRpc(submitRpc);
  const [offset, setOffset] = useState(0), [selected, select] = useState("");
  const status = useQuery({ queryKey: ["paseo-bot", host.id, offset], queryFn: () => read({ offset }), retry: false, refetchInterval: 10000 });
  const detail = useQuery({ queryKey: ["paseo-bot-result", host.id, selected], queryFn: () => result({ id: selected }), enabled: !!selected, retry: false, refetchInterval: 10000 });
  const mutation = useMutation({ mutationFn: submit, retry: false, onSuccess: value => { select(value.id); setOffset(0); void status.refetch(); } });
  return <BotView theme={theme} compact={layout.compact} data={status.data} loading={status.isPending} error={status.isError}
    refreshing={status.isFetching} refresh={() => { void status.refetch(); if (selected) void detail.refetch(); }}
    offset={offset} setOffset={setOffset} selected={selected} select={select} detail={detail.data}
    detailLoading={detail.isPending && !!selected} detailError={detail.isError} submit={task => mutation.mutateAsync(task)} />;
}
type Props = {
  theme: PluginTheme; compact: boolean; data?: Snapshot; loading: boolean; error: boolean; refreshing?: boolean;
  refresh: () => void; offset: number; setOffset: (n: number) => void; selected: string; select: (id: string) => void;
  detail?: Record<string, unknown>; detailLoading?: boolean; detailError?: boolean; submit: (task: Task) => Promise<unknown>;
};
export function BotView(p: Props) {
  const c = p.theme.colors;
  const body = { color: c.foreground, fontSize: 14, lineHeight: 24 };
  const muted = { ...body, color: c.foregroundMuted };
  const heading = { ...body, fontSize: 18, lineHeight: 28, fontWeight: "600" as const };
  const [form, showForm] = useState(false), [raw, showRaw] = useState(false);
  const [id, setId] = useState(makeTaskId), [project, setProject] = useState(""), [title, setTitle] = useState(""), [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<Task["kind"]>("gpt"), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  // Freeze ambiguous submissions. Retry sends the identical body and idempotency key.
  const frozen = useRef<Task | null>(null), inFlight = useRef(false);
  const canSubmit = !!p.data?.acceptsTasks && !p.error;
  function button(label: string, onPress: () => void, disabled = false, primary = false) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, justifyContent: "center", borderRadius: 8,
        borderWidth: 1, borderColor: c.border, backgroundColor: primary ? c.accent : pressed ? c.surface2 : c.surface1, opacity: disabled ? 0.5 : 1 })}>
      <Text style={{ ...body, color: primary ? c.accentForeground : c.foreground, textAlign: "center" }}>{label}</Text>
    </Pressable>;
  }
  function field(label: string, value: string, set: (s: string) => void, maxLength: number, multiline = false) {
    return <View style={{ gap: 4 }}><Text style={body}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={set} editable={!busy && !frozen.current} maxLength={maxLength}
        multiline={multiline} autoCapitalize="none" style={{ ...body, minHeight: multiline ? 144 : 44, padding: 12, borderRadius: 8, borderWidth: 1,
          borderColor: c.border, backgroundColor: c.surface1, textAlignVertical: "top" }} />
    </View>;
  }
  async function send() {
    if (inFlight.current || !canSubmit) return;
    const parsed = taskSchema.safeParse(frozen.current ?? { id, project, title, prompt, kind });
    if (!parsed.success || !p.data?.projects.some(x => x.id === parsed.data.project && x.enabled)) { setMessage("등록된 활성 프로젝트, 제목, 작업 내용을 확인하세요."); return; }
    frozen.current = parsed.data; inFlight.current = true; setBusy(true); setMessage("");
    try {
      await p.submit(parsed.data);
      setMessage(`접수됨 · ${parsed.data.id}. 처리 결과는 작업 상태에서 확인하세요.`);
      frozen.current = null; setId(makeTaskId()); setTitle(""); setPrompt("");
    } catch { setMessage(`접수 확인이 필요합니다. 작업 ID ${id}를 목록에서 확인하세요. 재시도는 같은 요청을 보냅니다.`); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const d = p.data;
  return <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ width: "100%", maxWidth: 1100, alignSelf: "center", padding: p.compact ? 16 : 24, gap: 24 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 160 }}><Text accessibilityRole="header" style={{ ...heading, fontSize: 24, lineHeight: 32 }}>Paseo 봇</Text>
        <Text style={muted}>VAXPORT · {p.loading ? "연결 중" : p.error ? "연결 확인 필요" : d?.healthy ? "정상 작동" : "실행기 확인 필요"}</Text></View>
      {button("새로고침", p.refresh, p.refreshing)}
      {button(form ? "양식 닫기" : "새 작업", () => showForm(!form), false, true)}
    </View>
    {p.error && <Text accessibilityRole="alert" style={body}>VAXPORT에 연결하지 못했습니다. Tailscale과 SSH 연결 설정을 확인한 뒤 새로고침하세요. 마지막으로 읽은 정보가 표시될 수 있습니다.</Text>}
    {p.loading && <Text accessibilityLiveRegion="polite" style={muted}>큐를 불러오는 중…</Text>}
    {d && <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>{Object.entries(d.queue).map(([state, count]) => <Text key={state} style={body}>{stateLabel(state)} {count}</Text>)}</View>
      <Text style={muted}>최근 실행 신호 {d.lastTickAt ? new Date(d.lastTickAt * 1000).toLocaleString() : "없음"} · 10초마다 갱신</Text>
    </View>}
    {form && <View style={{ gap: 16, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 16 }}>
      <Text accessibilityRole="header" style={heading}>새 작업 제출</Text>
      {!canSubmit && <Text style={body}>현재 제출할 수 없습니다. SSH 연결, 쓰기 허용 설정과 VAXPORT 큐 소유자를 확인하세요.</Text>}
      {field("프로젝트 ID", project, setProject, 200)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{d?.projects.filter(x => x.enabled).map(x => <View key={x.id}>{button(x.id, () => setProject(x.id), busy || !!frozen.current)}</View>)}</View>
      {field("제목", title, setTitle, 300)}
      <View style={{ gap: 4 }}><Text style={body}>작업 유형</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([ ["gpt", "일반"], ["hard", "복잡한 작업"], ["refactor", "리팩터링"], ["sync", "Git 확인"] ] as const).map(([value, label]) => <View key={value}>{button(`${kind === value ? "선택: " : ""}${label}`, () => setKind(value), busy || !!frozen.current, kind === value)}</View>)}
      </View></View>
      {field("작업 내용 (최대 40,000자)", prompt, setPrompt, 40000, true)}
      <Text selectable style={muted}>작업 ID {id}</Text>
      <Text style={muted}>제출하면 봇이 작업을 시작합니다. 시크릿을 입력하지 마세요.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{button(busy ? "접수 확인 중…" : frozen.current ? "같은 요청 재시도" : "작업 제출", () => void send(), busy || !canSubmit, true)}
        {frozen.current && button("새 요청 작성", () => { frozen.current = null; setId(makeTaskId()); setMessage(""); }, busy)}
      </View>
      {!!message && <Text accessibilityLiveRegion="polite" style={body}>{message}</Text>}
    </View>}
    <View style={{ flexDirection: p.compact ? "column" : "row", gap: 24, alignItems: "stretch" }}>
      <View style={{ flex: p.compact ? undefined : 1, minWidth: 0, gap: 8 }}>
        <Text accessibilityRole="header" style={heading}>작업 목록{d ? ` · ${d.total}` : ""}</Text>
        {d?.tasks.length === 0 && <Text style={muted}>등록된 작업이 없습니다. 새 작업을 제출할 수 있습니다.</Text>}
        {d?.tasks.map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`${task.title}, ${stateLabel(task.state)}`} accessibilityState={{ selected: p.selected === task.id }} onPress={() => { p.select(task.id); showRaw(false); }}
          style={({ pressed }) => ({ minHeight: 64, padding: 12, gap: 4, borderRadius: 8, borderWidth: 1, borderColor: p.selected === task.id ? c.accent : c.border, backgroundColor: pressed || p.selected === task.id ? c.surface2 : c.surface1 })}>
          <Text style={body}>{task.title}</Text><Text style={muted}>{stateLabel(task.state)} · {task.project}</Text><Text selectable style={{ ...muted, fontSize: 12 }}>{task.id}</Text>
        </Pressable>)}
        {d && d.total > 100 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{button("이전 100개", () => p.setOffset(Math.max(0, p.offset - 100)), p.offset === 0)}{button("다음 100개", () => p.setOffset(p.offset + 100), p.offset + 100 >= d.total)}</View>}
      </View>
      <View style={{ flex: p.compact ? undefined : 1, minWidth: 0, gap: 12 }}>
        <Text accessibilityRole="header" style={heading}>작업 결과</Text>
        {!p.selected && <Text style={muted}>목록에서 작업을 선택하세요.</Text>}
        {!!p.selected && <Text selectable style={muted}>{p.selected}</Text>}
        {p.detailLoading && <Text style={muted}>결과를 불러오는 중…</Text>}
        {p.detailError && <Text accessibilityRole="alert" style={body}>결과를 읽지 못했습니다. 새로고침으로 다시 확인하세요.</Text>}
        {p.detail && <View style={{ gap: 12 }}>
          <Text style={body}>{stateLabel(String(p.detail.state))}</Text>
          {!!p.detail.stage && <Text style={muted}>단계 · {String(p.detail.stage)}</Text>}
          {!!p.detail.summary && <Text selectable style={body}>{String(p.detail.summary)}</Text>}
          {!!p.detail.reason && <Text selectable style={body}>{String(p.detail.reason)}</Text>}
          <Text style={muted}>배포 · {p.detail.deployment === "not-run" ? "실행하지 않음" : String(p.detail.deployment ?? "정보 없음")}</Text>
          {button(raw ? "상세 JSON 닫기" : "상세 JSON 보기", () => showRaw(!raw))}
          {raw && <Text selectable style={{ ...body, fontSize: 12 }}>{JSON.stringify(p.detail, null, 2)}</Text>}
        </View>}
      </View>
    </View>
  </ScrollView>;
}
