import type {
  PluginScreenProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SKILLS, skillStatusRpc } from "../shared/skills";
import {
  WORKFLOWS,
  buildPrompt,
  canLaunch,
  createLauncher,
  type BrowserChoice,
} from "../shared/workflows";

type Props = PluginScreenProps & { workspaceId?: string };

export function SkillsScreen(props: PluginScreenProps) {
  return <Launcher key={props.host.id} {...props} />;
}
export function WorkspaceLauncher(props: PluginWorkspacePanelProps) {
  return (
    <Launcher
      key={`${props.host.id}:${props.workspaceId}`}
      {...props}
      params={{}}
    />
  );
}

function Launcher({ theme, layout, host, workspaceId, navigation }: Props) {
  const paseo = usePaseo();
  const fetchStatus = useRpc(skillStatusRpc);
  const [skillId, setSkillId] = useState<string>("paseo-browser");
  const [task, setTask] = useState("");
  const [browser, setBrowser] = useState<BrowserChoice>("auto");
  const [agentId, setAgentId] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const [tab, setTab] = useState<"launch" | "status">("launch");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    kind: "sent" | "error" | "uncertain";
    text: string;
    agentId?: string;
  } | null>(null);
  const attempt = useRef(createLauncher());
  const inFlight = useRef(false);
  const status = useQuery({
    queryKey: ["paseobility", host.id, "skills"],
    queryFn: () => fetchStatus({}),
    retry: false,
    refetchInterval: 30000,
  });
  const agents = useQuery({
    queryKey: [
      "paseobility",
      host.id,
      workspaceId ?? "all",
      "idle-agents",
      cursor ?? "first",
    ],
    queryFn: async () => {
      const page = await paseo.agents.list({
        filter: { statuses: ["idle"], includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200, cursor },
      });
      return {
        entries: page.entries
          .map(({ agent }) => agent)
          .filter((agent) => canLaunch(agent, workspaceId)),
        next: page.pageInfo.hasMore ? page.pageInfo.nextCursor : null,
      };
    },
    retry: false,
    refetchInterval: 15000,
  });
  const skill = WORKFLOWS.find((item) => item.id === skillId)!;
  const chosen = agents.data?.entries.find((agent) => agent.id === agentId);
  const installed = status.data?.skills.find((item) => item.id === skillId);
  const available =
    chosen?.provider === "claude" ? installed?.claude : installed?.paseo;
  const locked =
    busy ||
    attempt.current.state() === "sent" ||
    attempt.current.state() === "uncertain";
  let preview = "";
  try {
    preview = buildPrompt(skillId, task, browser);
  } catch {
    /* Inline guidance below. */
  }
  const c = theme.colors;
  const font =
    Platform.OS === "web"
      ? '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
      : undefined;
  const body = {
    color: c.foreground,
    fontFamily: font,
    fontSize: 14,
    lineHeight: 24,
  };
  const muted = { ...body, color: c.foregroundMuted };
  const heading = {
    ...body,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "600" as const,
  };
  const input = {
    ...body,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    backgroundColor: c.surface0,
    padding: 12,
    minHeight: 44,
  };
  const visible = (agents.data?.entries ?? []).filter((agent) =>
    `${agent.title ?? ""} ${agent.cwd} ${agent.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function button(
    label: string,
    onPress: () => void,
    selected = false,
    disabled = false,
  ) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: selected ? c.accent : c.border,
          backgroundColor: selected
            ? c.accent
            : pressed
              ? c.surface2
              : c.surface1,
          opacity: disabled ? 0.6 : 1,
          justifyContent: "center",
        })}
      >
        <Text
          style={{
            ...body,
            color: selected ? c.accentForeground : c.foreground,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  async function send() {
    if (
      inFlight.current ||
      locked ||
      !chosen ||
      !preview ||
      !available ||
      status.isError ||
      agents.isError
    )
      return;
    inFlight.current = true;
    const target = chosen.id;
    setBusy(true);
    setResult(null);
    try {
      // Re-read installation as well as the agent immediately before sending.
      const fresh = await fetchStatus({});
      const entry = fresh.skills.find((item) => item.id === skillId);
      if (!(chosen.provider === "claude" ? entry?.claude : entry?.paseo))
        throw new Error(
          "대상 PC에서 스킬 파일을 찾지 못했습니다. 스킬을 설치한 뒤 다시 확인해주세요.",
        );
      await attempt.current.launch(
        paseo.agents.ref(target),
        preview,
        workspaceId,
      );
      setResult({
        kind: "sent",
        text: "에이전트에 전달했습니다. 진행 상황과 결과는 대상 대화에서 확인하세요.",
        agentId: target,
      });
      void agents.refetch();
    } catch (error) {
      setResult({
        kind: attempt.current.state() === "uncertain" ? "uncertain" : "error",
        text:
          error instanceof Error
            ? error.message
            : "상태 확인에 실패했습니다. 새로고침 후 다시 시도해주세요.",
        agentId: target,
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 8 }}>
        <Text
          accessibilityRole="header"
          style={{ ...heading, fontSize: 24, lineHeight: 36 }}
        >
          Paseobility
        </Text>
        <Text style={muted}>
          {host.label} · {workspaceId ? "현재 작업 공간" : "이 PC의 에이전트"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {button("스킬 실행", () => setTab("launch"), tab === "launch")}
          {button("설치 상태", () => setTab("status"), tab === "status")}
          {button(
            "새로고침",
            () => {
              void status.refetch();
              void agents.refetch();
            },
            false,
            status.isFetching || agents.isFetching,
          )}
        </View>
      </View>
      {tab === "status" ? (
        <View style={{ gap: 16 }}>
          <Text style={heading}>이 PC의 설치 상태</Text>
          <Text style={muted}>
            파일 존재 여부를 확인합니다. 실행 권한·로그인·실제 동작은 각
            작업에서 확인합니다.
          </Text>
          {status.isPending ? (
            <Text style={muted}>설치 상태 확인 중…</Text>
          ) : null}
          {status.isError ? (
            <Text accessibilityRole="alert" style={body}>
              설치 상태를 읽지 못했습니다. PC 연결을 확인하고 새로고침해주세요.
            </Text>
          ) : null}
          {!status.isError && status.data ? (
            <>
              <Text style={body}>
                {status.data.platform} ·{" "}
                {status.data.skills.filter((item) => item.paseo).length}/
                {SKILLS.length}개 Paseo 스킬 파일 확인
              </Text>
              {status.data.tools.map((tool) => (
                <Text key={tool.id} style={body}>
                  {tool.label} ·{" "}
                  {tool.detected ? "파일 감지" : "기본 경로에서 찾지 못함"}
                </Text>
              ))}
              {WORKFLOWS.map((item) => {
                const entry = status.data.skills.find((s) => s.id === item.id);
                return (
                  <View
                    key={item.id}
                    style={{
                      gap: 4,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text style={{ ...body, fontWeight: "600" }}>
                      {item.title}
                    </Text>
                    <Text selectable style={muted}>
                      {item.id}
                    </Text>
                    <Text style={body}>
                      Paseo {entry?.paseo ? "설치됨" : "없음"} · Claude{" "}
                      {entry?.claude ? "설치됨" : "없음"}
                    </Text>
                  </View>
                );
              })}
            </>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            flexDirection: layout.compact ? "column" : "row",
            gap: 24,
            alignItems: "stretch",
          }}
        >
          <View
            style={{
              width: layout.compact ? undefined : 240,
              flexShrink: 0,
              gap: 8,
            }}
          >
            <Text accessibilityRole="header" style={heading}>
              1. 스킬 선택
            </Text>
            <View
              style={{
                flexDirection: layout.compact ? "row" : "column",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {WORKFLOWS.map((item) =>
                button(
                  item.title,
                  () => {
                    setSkillId(item.id);
                    setResult(null);
                  },
                  skillId === item.id,
                  locked,
                ),
              )}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 24 }}>
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={heading}>
                2. {skill.title}
              </Text>
              <Text style={muted}>{skill.hint}</Text>
              <Text selectable style={muted}>
                /{skill.id}
              </Text>
              {skillId === "paseo-browser" ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {(
                    [
                      ["auto", "기본 브라우저"],
                      ["ego", "Ego Lite"],
                      ["chrome", "열려 있는 Chrome"],
                    ] as const
                  ).map(([value, label]) =>
                    button(
                      label,
                      () => setBrowser(value),
                      browser === value,
                      locked,
                    ),
                  )}
                </View>
              ) : null}
              <TextInput
                accessibilityLabel="작업 내용"
                placeholder={skill.placeholder}
                placeholderTextColor={c.foregroundMuted}
                multiline
                maxLength={12000}
                value={task}
                onChangeText={setTask}
                editable={!locked}
                style={{ ...input, minHeight: 144, textAlignVertical: "top" }}
              />
              {!task.trim() ? (
                <Text style={muted}>
                  원하는 결과와 대상 URL·파일·PC를 적어주세요.
                </Text>
              ) : null}
            </View>
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={heading}>
                3. 실행할 에이전트
              </Text>
              <Text style={muted}>
                대기 중인 에이전트를 선택하세요. 목록이 비어 있으면 Paseo에서 새
                에이전트를 만든 뒤 새로고침하세요.
              </Text>
              <TextInput
                accessibilityLabel="에이전트 검색"
                placeholder="제목 또는 작업 경로로 찾기…"
                placeholderTextColor={c.foregroundMuted}
                value={search}
                onChangeText={setSearch}
                editable={!locked}
                style={input}
              />
              {agents.isPending ? (
                <Text style={muted}>에이전트 확인 중…</Text>
              ) : null}
              {agents.isError ? (
                <Text accessibilityRole="alert" style={body}>
                  에이전트 목록을 읽지 못했습니다. 연결을 확인한 뒤
                  새로고침해주세요.
                </Text>
              ) : null}
              {!agents.isPending && !agents.isError && visible.length === 0 ? (
                <Text style={muted}>
                  조건에 맞는 대기 중인 에이전트가 없습니다.
                </Text>
              ) : null}
              <ScrollView
                style={{ maxHeight: 240 }}
                nestedScrollEnabled
                contentContainerStyle={{ gap: 8 }}
              >
                {!agents.isError &&
                  visible.map((agent) => (
                    <Pressable
                      key={agent.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${agent.title || agent.id.slice(0, 8)} · ${agent.provider} · ${agent.cwd}`}
                      accessibilityState={{
                        selected: agentId === agent.id,
                        disabled: locked,
                      }}
                      disabled={locked}
                      onPress={() => setAgentId(agent.id)}
                      style={{
                        padding: 12,
                        minHeight: 44,
                        gap: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: agentId === agent.id ? c.accent : c.border,
                        backgroundColor:
                          agentId === agent.id ? c.surface2 : c.surface1,
                      }}
                    >
                      <Text style={{ ...body, fontWeight: "600" }}>
                        {agentId === agent.id ? "선택됨 · " : ""}
                        {agent.title || agent.id.slice(0, 8)}
                      </Text>
                      <Text style={muted} numberOfLines={2}>
                        {agent.provider} · {agent.cwd}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
              {cursor || agents.data?.next ? (
                <View style={{ gap: 8 }}>
                  <Text style={muted}>
                    PC의 에이전트를 200개씩 확인합니다. 검색과 작업 공간 필터는
                    현재 페이지에 적용됩니다.
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {cursor
                      ? button(
                          "이전 에이전트",
                          () => {
                            setCursors((values) => values.slice(0, -1));
                            setAgentId("");
                          },
                          false,
                          locked,
                        )
                      : null}
                    {agents.data?.next
                      ? button(
                          "다음 에이전트",
                          () => {
                            setCursors((values) => [
                              ...values,
                              agents.data!.next!,
                            ]);
                            setAgentId("");
                          },
                          false,
                          locked,
                        )
                      : null}
                  </View>
                </View>
              ) : null}
              {!agents.isError &&
                (status.isError ? (
                  <Text accessibilityRole="alert" style={body}>
                    설치 상태 확인 실패 · 새로고침이 필요합니다.
                  </Text>
                ) : chosen && !available && !status.isPending ? (
                  <Text style={body}>
                    이 PC의 {chosen.provider === "claude" ? "Claude" : "Paseo"}{" "}
                    경로에 스킬이 없습니다. 먼저 스킬을 설치해주세요.
                  </Text>
                ) : null)}
            </View>
            <View
              style={{
                gap: 12,
                padding: 16,
                borderRadius: 8,
                backgroundColor: c.surface1,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={heading}>보낼 내용</Text>
              <Text selectable style={body}>
                {preview ||
                  "작업 내용을 입력하면 전송할 지시문이 여기에 나타납니다."}
              </Text>
              {chosen ? (
                <Text style={muted}>
                  대상: {host.label} / {chosen.title || chosen.id.slice(0, 8)}
                </Text>
              ) : null}
              {button(
                busy ? "상태 확인·전송 중…" : "선택한 에이전트에 보내기",
                () => void send(),
                true,
                locked ||
                  !chosen ||
                  !preview ||
                  !available ||
                  status.isError ||
                  agents.isError,
              )}
              <Text style={muted}>
                선택한 에이전트의 기존 대화에 전달하며, 해당 모델의 사용량이
                발생합니다.
              </Text>
              {result ? (
                <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
                  <Text style={body}>{result.text}</Text>
                  {result.agentId && navigation
                    ? button("대상 대화 열기", () =>
                        navigation.openAgent({
                          agentId: result.agentId!,
                          serverId: host.id,
                        }),
                      )
                    : null}
                  {result.kind === "sent"
                    ? button("새 작업 작성", () => {
                        attempt.current = createLauncher();
                        setTask("");
                        setAgentId("");
                        setResult(null);
                      })
                    : null}
                  {result.kind === "uncertain"
                    ? button("대화 확인 완료 · 새 작업 작성", () => {
                        attempt.current = createLauncher();
                        setTask("");
                        setAgentId("");
                        setResult(null);
                      })
                    : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
