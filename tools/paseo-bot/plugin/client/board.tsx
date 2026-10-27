import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Filters, Snapshot, TaskRow } from "../shared/contracts";
import { modelTone, projectTone, requesterTone, statusTone, toneInk } from "../shared/colors";
import {
  duration,
  laneOf,
  lanes,
  modelLabel,
  relativeTime,
  requesterLabel,
  safePr,
  stageLabel,
} from "../shared/model";
import { Badge, Button, Empty, Glyph, MotionIn, Select, Skeleton, StageRail, Tag, useReducedMotion, useUi } from "./ui";

export function TaskCard({
  task,
  onOpen,
  onRetry,
  list = false,
  now,
  projects,
  direction = 0,
}: {
  task: TaskRow;
  projects: string[];
  direction?: number;
  onOpen: () => void;
  onRetry: () => void;
  list?: boolean;
  now: number;
}) {
  const t = useUi();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduced = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    lift.stopAnimation();
    if (reduced) { lift.setValue(0); return; }
    const animation = Animated.spring(lift, { toValue: hovered ? 1 : 0, friction: 7, tension: 160, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [hovered, reduced, lift]);
  const terminal = ["passed", "failed", "blocked", "unknown"].includes(
    task.state,
  );
  const group = laneOf(task.state);
  const tone = statusTone(group);
  const model = modelLabel(task.model, true);
  return (
    <MotionIn motionKey={`${task.id}:${task.state}`} direction={direction}>
    <Animated.View
      testID="task-card"
      style={{
        ...t.panel,
        ...t.shadow(hovered),
        transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
        borderColor: focused ? t.c.accent : hovered ? t.tint(tone, 0.6).background : t.c.border,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <View style={{ height: 4, backgroundColor: toneInk(tone), opacity: hovered || group === "running" ? 1 : 0.7 }} />
      <Pressable
        testID="task-open"
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.state}`}
        onPress={onOpen}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => ({
          minHeight: 64,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          gap: 8,
          backgroundColor: pressed ? t.c.surface2 : hovered ? t.tint(tone, 0.05).background : "transparent",
          flexDirection: list ? "row" : "column",
          alignItems: list ? "center" : "stretch",
        })}
      >
        <View style={{ flex: list ? 1 : undefined, gap: 8, minWidth: 0 }}>
          <Text numberOfLines={3} style={{ ...t.body, fontWeight: "600" }}>
            {task.title}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            <Tag dot label={task.project} maxWidth={180} tone={projectTone(task.project, projects)} />
            {!!model && <Tag dot label={model} tone={modelTone(task.model)} />}
          </View>
        </View>
        <View style={{ gap: 8, minWidth: list ? 200 : undefined }}>
          <Badge
            state={task.state}
            label={
              group === "running" && task.stage
                ? stageLabel(task.stage)
                : undefined
            }
          />
          <StageRail state={task.state} stage={task.stage} />
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Glyph name="Monitor" size={13} />
          <Text style={t.small}>{task.machine || "머신 배정 대기"}</Text>
          <Text style={t.small}>· {task.profile || "프로필 배정 대기"}</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Tag label={requesterLabel(task.requester)} tone={requesterTone(task.requester)} />
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Glyph name="Timer" size={13} />
            <Text style={t.small}>
              {duration(task.createdAt, terminal ? task.updatedAt : now)}
            </Text>
          </View>
        </View>
        <Text style={t.small}>{relativeTime(task.createdAt, now)} 접수</Text>
        {(safePr(task.prUrl) || task.state === "failed") && (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {!!safePr(task.prUrl) && (
              <View style={{ minHeight: 44, justifyContent: "center" }}>
                <ExternalLink href={safePr(task.prUrl)}>
                  PR 자세히 보기
                </ExternalLink>
              </View>
            )}
            {task.state === "failed" && (
              <Button label="재시도" icon="RotateCcw" onPress={onRetry} tone="red" />
            )}
          </View>
        )}
      </View>
    </Animated.View>
    </MotionIn>
  );
}
type Props = {
  data?: Snapshot;
  loading: boolean;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  view: "kanban" | "list";
  setView: (v: "kanban" | "list") => void;
  open: (r: TaskRow) => void;
  retry: (r: TaskRow) => void;
  searchRef: RefObject<TextInput | null>;
  conversation: string;
  now: number;
};
export function Board(p: Props) {
  const [boardHeight, setBoardHeight] = useState(400);
  const t = useUi(),
    rows = p.data?.tasks ?? [];
  const previousLanes = useRef(new Map<string, string>());
  const movement = (task: TaskRow) => {
    const before = previousLanes.current.get(task.id);
    if (!before || before === laneOf(task.state)) return 0;
    return Math.sign(lanes.findIndex(l => l.id === laneOf(task.state)) - lanes.findIndex(l => l.id === before));
  };
  useEffect(() => { previousLanes.current = new Map(rows.map(task => [task.id, laneOf(task.state)])); }, [rows]);
  const set = (f: Partial<Filters>) => p.setFilters({ ...f, offset: 0 });
  const projects = p.data?.projects ?? [],
    machines = [...new Set(projects.flatMap((p) => p.machines))];
  return (
    <View testID="bot-task-surface" style={{ flex: 1, minWidth: 0, gap: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 100 }}>
          <Text accessibilityRole="header" style={t.heading}>작업 보드</Text>
          <Text style={t.small}>
            {p.data
              ? `${p.data.filtered}개 작업 · 봇이 상태를 갱신합니다`
              : "큐를 연결하고 있습니다"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Button
            label="칸반"
            icon="Columns3"
            selected={p.view === "kanban"}
            onPress={() => p.setView("kanban")}
          />
          <Button
            label="목록"
            icon="List"
            selected={p.view === "list"}
            onPress={() => p.setView("list")}
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: t.c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            backgroundColor: t.c.surface1,
          }}
        >
          <Glyph name="Search" />
          <TextInput
            ref={p.searchRef}
            accessibilityLabel="작업 검색"
            placeholder="작업 제목이나 ID 검색"
            placeholderTextColor={t.c.foregroundMuted}
            value={p.filters.query}
            onChangeText={(query) => set({ query })}
            style={{
              ...t.body,
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              paddingVertical: 10,
            }}
          />
          <Text style={t.small}>/</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Select
            label="상태"
            icon="CircleDot"
            tone={p.filters.group ? statusTone(p.filters.group) : undefined}
            value={p.filters.group}
            options={[
              { value: "", label: "전체 상태" },
              ...lanes.map((l) => ({ value: l.id, label: l.label, tone: statusTone(l.id) })),
            ]}
            onChange={(group) => set({ group: group as Filters["group"] })}
          />
          <Select
            label="프로젝트"
            icon="FolderGit2"
            tone={p.filters.project ? projectTone(p.filters.project, projects.map(x => x.id)) : undefined}
            value={p.filters.project}
            options={[
              { value: "", label: "전체" },
              ...projects.map((x) => ({ value: x.id, label: x.id, tone: projectTone(x.id, projects.map(y => y.id)) })),
            ]}
            onChange={(project) => set({ project })}
          />
          <Select
            label="머신"
            icon="Monitor"
            tone={p.filters.machine ? "cyan" : undefined}
            value={p.filters.machine}
            options={[
              { value: "", label: "전체" },
              ...machines.map((m) => ({ value: m, label: m })),
            ]}
            onChange={(machine) => set({ machine })}
          />
          <Select
            label="요청자"
            icon="UserRound"
            tone={p.filters.requester ? requesterTone(p.filters.requester) : undefined}
            value={p.filters.requester}
            options={[
              { value: "", label: "전체" },
              ...["gui", "grok", "cli", "legacy"].map((m) => ({
                value: m,
                label: requesterLabel(m),
                tone: requesterTone(m),
              })),
            ]}
            onChange={(requester) => set({ requester })}
          />
          <Select
            label="정렬"
            icon="ArrowDownUp"
            value={p.filters.sort}
            options={[
              { value: "newest", label: "최신 접수순" },
              { value: "oldest", label: "오래된 접수순" },
              { value: "updated", label: "최근 변경순" },
              { value: "title", label: "제목순" },
            ]}
            onChange={(sort) => set({ sort: sort as Filters["sort"] })}
          />
          {!!p.conversation && (
            <Button
              label={p.filters.scope ? "현재 대화만" : "전체 대화"}
              selected={!!p.filters.scope}
              onPress={() =>
                set({ scope: p.filters.scope ? "" : p.conversation })
              }
            />
          )}
        </View>
      </View>
      {p.loading ? (
        <Skeleton label="작업 목록을 불러오는 중" />
      ) : rows.length === 0 ? (
        <Empty
          title={
            p.data?.total
              ? "조건에 맞는 작업이 없습니다"
              : "첫 작업을 함께 시작해 볼까요?"
          }
          body={
            p.data?.total
              ? "검색어나 필터를 바꾸면 다른 작업을 볼 수 있습니다."
              : "왼쪽 대화창에 원하는 작업을 알려주세요. 봇이 계획을 제안합니다."
          }
          action={
            p.data?.total ? (
              <Button
                label="필터 초기화"
                onPress={() =>
                  set({
                    query: "",
                    project: "",
                    machine: "",
                    group: "",
                    requester: "",
                    scope: "",
                  })
                }
              />
            ) : undefined
          }
        />
      ) : p.view === "kanban" ? (
        <View
          style={{ flex: 1, minHeight: 240 }}
          onLayout={(e) =>
            setBoardHeight(Math.max(240, e.nativeEvent.layout.height))
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={{ flex: 1, minHeight: 240 }}
            contentContainerStyle={{
              gap: 12,
              alignItems: "stretch",
              height: boardHeight,
            }}
          >
            {lanes.map((lane) => {
              const tone = statusTone(lane.id), track = t.tint(tone, 0.07, t.c.surface0), head = t.tint(tone, 0.18, t.c.surface0);
              const count = rows.filter((r) => laneOf(r.state) === lane.id).length;
              return (
              <View
                key={lane.id}
                testID={`lane-${lane.id}`}
                style={{ width: 264, gap: 8, height: boardHeight, backgroundColor: track.background, borderRadius: 14, padding: 8, borderWidth: 1, borderColor: track.border }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: head.background,
                  }}
                >
                  <Glyph
                    name={
                      lane.id === "running"
                        ? "CircleDot"
                        : lane.id === "success"
                          ? "CircleCheck"
                          : lane.id === "failed"
                            ? "CircleX"
                            : lane.id === "attention"
                              ? "CircleAlert"
                              : "CircleDashed"
                    }
                    color={head.foreground}
                  />
                  <Text style={{ ...t.body, fontWeight: "600", flex: 1, color: head.foreground }}>
                    {lane.label}
                  </Text>
                  <View style={{ minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface1 }}>
                    <Text style={{ ...t.small, color: t.c.foreground, fontWeight: "600" }}>{count}</Text>
                  </View>
                </View>
                <ScrollView
                  testID={`lane-scroll-${lane.id}`}
                  style={{ flex: 1, minHeight: 0 }}
                  contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
                >
                  {rows
                    .filter((r) => laneOf(r.state) === lane.id)
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        projects={projects.map(p => p.id)}
                        direction={movement(task)}
                        onOpen={() => p.open(task)}
                        onRetry={() => p.retry(task)}
                        now={p.now}
                      />
                    ))}
                  {!count && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: track.border,
                        borderRadius: 10,
                        padding: 16,
                        minHeight: 80,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={t.small}>이 상태의 작업이 없습니다.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            );})}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
        >
          {rows.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projects={projects.map(p => p.id)}
              direction={movement(task)}
              list
              onOpen={() => p.open(task)}
              onRetry={() => p.retry(task)}
              now={p.now}
            />
          ))}
        </ScrollView>
      )}
      {!!p.data && p.data.filtered > 100 && (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Button
            label="이전"
            disabled={p.filters.offset === 0}
            onPress={() =>
              p.setFilters({ offset: Math.max(0, p.filters.offset - 100) })
            }
          />
          <Text style={t.small}>
            {p.filters.offset + 1}–
            {Math.min(p.filters.offset + 100, p.data.filtered)} /{" "}
            {p.data.filtered}
          </Text>
          <Button
            label="다음"
            disabled={p.filters.offset + 100 >= p.data.filtered}
            onPress={() => p.setFilters({ offset: p.filters.offset + 100 })}
          />
        </View>
      )}
    </View>
  );
}
