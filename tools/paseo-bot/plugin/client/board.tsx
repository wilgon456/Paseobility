import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useState, type RefObject } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Filters, Snapshot, TaskRow } from "../shared/contracts";
import {
  duration,
  laneOf,
  lanes,
  relativeTime,
  requesterLabel,
  safePr,
  stageLabel,
} from "../shared/model";
import { Badge, Button, Empty, Glyph, Select, Skeleton, useUi } from "./ui";

export function TaskCard({
  task,
  onOpen,
  onRetry,
  list = false,
  now,
}: {
  task: TaskRow;
  onOpen: () => void;
  onRetry: () => void;
  list?: boolean;
  now: number;
}) {
  const t = useUi();
  const [focused, setFocused] = useState(false);
  const terminal = ["passed", "failed", "blocked", "unknown"].includes(
    task.state,
  );
  return (
    <View
      testID="task-card"
      style={{
        ...t.panel,
        borderColor: focused ? t.c.accent : t.c.border,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <Pressable
        testID="task-open"
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.state}`}
        onPress={onOpen}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => ({
          minHeight: 64,
          padding: 16,
          gap: 12,
          backgroundColor: pressed ? t.c.surface2 : "transparent",
          flexDirection: list ? "row" : "column",
          alignItems: list ? "center" : "stretch",
        })}
      >
        <View style={{ flex: list ? 1 : undefined, gap: 6, minWidth: 0 }}>
          <Text numberOfLines={3} style={{ ...t.body, fontWeight: "600" }}>
            {task.title}
          </Text>
          <Text style={t.small}>{task.project}</Text>
        </View>
        <Badge
          state={task.state}
          label={
            laneOf(task.state) === "running" && task.stage
              ? stageLabel(task.stage)
              : undefined
          }
        />
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
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
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 8,
              backgroundColor: t.c.surface2,
            }}
          >
            <Text style={{ ...t.small, color: t.c.foreground }}>
              {requesterLabel(task.requester)}
            </Text>
          </View>
          <Text style={t.small}>
            {duration(task.createdAt, terminal ? task.updatedAt : now)}
          </Text>
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
              <Button label="재시도" icon="RotateCcw" onPress={onRetry} quiet />
            )}
          </View>
        )}
      </View>
    </View>
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
          <Text style={t.heading}>작업 보드</Text>
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
            borderRadius: 8,
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
            value={p.filters.group}
            options={[
              { value: "", label: "전체 상태" },
              ...lanes.map((l) => ({ value: l.id, label: l.label })),
            ]}
            onChange={(group) => set({ group: group as Filters["group"] })}
          />
          <Select
            label="프로젝트"
            value={p.filters.project}
            options={[
              { value: "", label: "전체" },
              ...projects.map((p) => ({ value: p.id, label: p.id })),
            ]}
            onChange={(project) => set({ project })}
          />
          <Select
            label="머신"
            value={p.filters.machine}
            options={[
              { value: "", label: "전체" },
              ...machines.map((m) => ({ value: m, label: m })),
            ]}
            onChange={(machine) => set({ machine })}
          />
          <Select
            label="요청자"
            value={p.filters.requester}
            options={[
              { value: "", label: "전체" },
              ...["gui", "grok", "cli", "legacy"].map((m) => ({
                value: m,
                label: requesterLabel(m),
              })),
            ]}
            onChange={(requester) => set({ requester })}
          />
          <Select
            label="정렬"
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
            {lanes.map((lane) => (
              <View
                key={lane.id}
                testID={`lane-${lane.id}`}
                style={{ width: 248, gap: 12, height: boardHeight }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    paddingVertical: 4,
                    paddingHorizontal: 0,
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
                  />
                  <Text style={{ ...t.body, fontWeight: "600" }}>
                    {lane.label}
                  </Text>
                  <Text style={t.small}>
                    {rows.filter((r) => laneOf(r.state) === lane.id).length}
                  </Text>
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
                        onOpen={() => p.open(task)}
                        onRetry={() => p.retry(task)}
                        now={p.now}
                      />
                    ))}
                  {!rows.some((r) => laneOf(r.state) === lane.id) && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: t.c.border,
                        borderRadius: 12,
                        padding: 16,
                        minHeight: 80,
                      }}
                    >
                      <Text style={t.small}>이 상태의 작업이 없습니다.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            ))}
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
