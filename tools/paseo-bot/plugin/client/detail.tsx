import { useState } from "react";
import {
  copyText,
  ExternalLink,
  Modal,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { Text, TextInput, View } from "react-native";
import type { TaskRow } from "../shared/contracts";
import { requesterLabel, safePr, stageLabel } from "../shared/model";
import { Badge, Button, Glyph, Notice, Skeleton, Tag, useUi } from "./ui";
import { recordedWorkflow, stagesOf, verificationLabel, workflowLabel, workflows } from "./workflow";
function JsonNode({
  name,
  value,
  depth = 0,
}: {
  name: string;
  value: unknown;
  depth?: number;
}) {
  const t = useUi(),
    [open, setOpen] = useState(depth < 1),
    complex = typeof value === "object" && value !== null;
  if (!complex)
    return (
      <Text selectable style={{ ...t.body, fontSize: 12, paddingVertical: 4 }}>
        {name}: {JSON.stringify(value)}
      </Text>
    );
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <View style={{ gap: 4 }}>
      <Button
        label={`${open ? "접기" : "펼치기"} · ${name} (${entries.length})`}
        icon={open ? "ChevronDown" : "ChevronRight"}
        onPress={() => setOpen(!open)}
        quiet
      />
      {open && (
        <View
          style={{
            paddingLeft: 12,
            borderLeftWidth: 1,
            borderColor: t.c.border,
            gap: 4,
          }}
        >
          {depth < 6 ? (
            entries
              .slice(0, 100)
              .map(([k, v]) => (
                <JsonNode key={k} name={k} value={v} depth={depth + 1} />
              ))
          ) : (
            <Text selectable style={t.small}>
              {JSON.stringify(value)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function Detail({
  task,
  data,
  loading,
  error,
  close,
  retry,
}: {
  task: TaskRow;
  data?: Record<string, unknown>;
  loading: boolean;
  error: boolean;
  close: () => void;
  retry: () => void;
}) {
  const t = useUi(),
    toast = useToast(),
    [tab, setTab] = useState("summary"),
    [search, setSearch] = useState("");
  const evidence = object(data?.evidence),
    runs = Array.isArray(data?.runs)
      ? (data!.runs as Record<string, unknown>[])
      : [];
  const workflow = recordedWorkflow(data?.workflow ?? task.workflow),
    stages = stagesOf(workflow);
  const json = JSON.stringify(data, null, 2);
  async function copy() {
    try {
      await copyText(json);
      toast.show("결과 JSON을 복사했습니다.", { variant: "success" });
    } catch {
      toast.error("복사하지 못했습니다. 본문을 선택해 복사해 주세요.");
    }
  }
  return (
    <Modal
      title={task.title}
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Content>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Badge state={String(data?.state ?? task.state)} />
          {!!data && <Tag label={`${workflowLabel(workflow)} · ${verificationLabel(data.verification, workflow)}`} tone={workflows[workflow].tone} />}
          <Text style={t.muted}>
            {task.project} · {requesterLabel(task.requester)}
          </Text>
        </View>
        <Text selectable style={t.small}>
          {task.id}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {[
            ["summary", "요약"],
            ["logs", "단계 기록"],
            ["json", "결과 JSON"],
          ].map(([v, label]) => (
            <Button
              key={v}
              label={label}
              selected={tab === v}
              onPress={() => setTab(v)}
            />
          ))}
        </View>
        {loading ? (
          <Skeleton label="작업 결과를 불러오는 중" />
        ) : error ? (
          <Notice title="결과를 불러오지 못했습니다" error>
            연결을 확인한 뒤 상세 패널을 다시 열어주세요.
          </Notice>
        ) : (
          data && (
            <View style={{ gap: 20 }}>
              {tab === "summary" && (
                <>
                  <View style={{ gap: 8 }}>
                    {!!data.summary && (
                      <Text selectable style={t.body}>
                        {String(data.summary)}
                      </Text>
                    )}
                    {!!data.reason && (
                      <Notice title="확인이 필요합니다">
                        {String(data.reason)}
                      </Notice>
                    )}
                    <Text style={t.muted}>
                      배포:{" "}
                      {data.deployment === "not-run"
                        ? "실행하지 않음"
                        : String(data.deployment ?? "기록 없음")}
                    </Text>
                    {safePr(task.prUrl) && (
                      <ExternalLink href={safePr(task.prUrl)}>
                        PR 열기
                      </ExternalLink>
                    )}
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={t.heading}>진행 단계</Text>
                    {stages.map(
                      (stage, index) => {
                        const done = !!evidence[stage],
                          active = data.stage === stage && !done;
                        return (
                          <View
                            key={stage}
                            testID="stage-row"
                            style={{
                              flexDirection: "row",
                              gap: 12,
                              paddingVertical: 12,
                              alignItems: "center",
                              borderBottomWidth: index === stages.length - 1 ? 0 : 1,
                              borderColor: t.c.border,
                            }}
                          >
                            <Glyph
                              name={
                                done
                                  ? "CircleCheck"
                                  : active
                                    ? "CircleDot"
                                    : "CircleDashed"
                              }
                              color={
                                done
                                  ? t.c.statusSuccess
                                  : active
                                    ? t.c.accent
                                    : t.c.foregroundMuted
                              }
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={t.body}>{stageLabel(stage)}</Text>
                              <Text style={t.small}>
                                {done
                                  ? "검증 기록 있음"
                                  : active
                                    ? "현재 단계"
                                    : "아직 실행하지 않음"}
                              </Text>
                            </View>
                          </View>
                        );
                      },
                    )}
                  </View>
                </>
              )}
              {tab === "logs" && (
                <View style={{ gap: 16 }}>
                  <Text style={t.muted}>
                    검증 영수증과 단계별 기록입니다. 원시 도구 출력은 수집하지
                    않습니다.
                  </Text>
                  {stages.map(
                    (stage) => {
                      const e = object(evidence[stage]),
                        run = runs.find((r) => r.stage === stage);
                      return (
                        <View
                          key={stage}
                          style={{ ...t.panel, padding: 16, gap: 8 }}
                        >
                          <Text style={t.heading}>{stageLabel(stage)}</Text>
                          <Text style={t.small}>
                            {String(run?.profile ?? "프로필 기록 없음")} ·{" "}
                            {String(run?.model ?? "모델 기록 없음")}
                          </Text>
                          <Text selectable style={t.body}>
                            {String(
                              e.summary ??
                                (data.stage === stage
                                  ? (data.reason ??
                                    "진행 기록을 기다리고 있습니다.")
                                  : "아직 기록이 없습니다."),
                            )}
                          </Text>
                          {Array.isArray(e.gates) &&
                            e.gates.map((g: unknown, i: number) => (
                              <Text key={i} selectable style={t.small}>
                                {String(object(g).command)} · 종료 코드{" "}
                                {String(object(g).exitCode)}
                              </Text>
                            ))}
                        </View>
                      );
                    },
                  )}
                </View>
              )}
              {tab === "json" && (
                <View style={{ gap: 12 }}>
                  <Button
                    label="원문 복사"
                    icon="Copy"
                    onPress={() => void copy()}
                  />
                  <Text style={t.small}>
                    시크릿을 마스킹한 API 응답을 복사합니다.
                  </Text>
                  <TextInput
                    accessibilityLabel="JSON 검색"
                    placeholder="JSON에서 찾기"
                    placeholderTextColor={t.c.foregroundMuted}
                    value={search}
                    onChangeText={setSearch}
                    style={{
                      ...t.body,
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor: t.c.border,
                      borderRadius: 8,
                      padding: 12,
                    }}
                  />
                  {Object.entries(data)
                    .filter(
                      ([k, v]) =>
                        !search ||
                        (k + JSON.stringify(v))
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map(([k, v]) => (
                      <JsonNode key={k} name={k} value={v} />
                    ))}
                </View>
              )}
              {task.state === "failed" && (
                <Button
                  label="이 작업 재시도 검토"
                  icon="RotateCcw"
                  onPress={retry}
                />
              )}
            </View>
          )
        )}
      </Modal.Content>
    </Modal>
  );
}
