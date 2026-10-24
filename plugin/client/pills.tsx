import { followAgentPills } from "./agent-pills";
import type {
  PluginClientContext,
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import { useRpc, useAgent } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { WORKFLOWS } from "../shared/workflows";
import { skillStatusRpc } from "../shared/skills";
import { attachSkill, markerId, resolveEditor } from "./web";
import { palette } from "./screen";
function PillIcon(props: PluginButtonIconProps) {
  return (
    <View
      testID={markerId(
        props.host.id,
        props.context === "agent" ? props.agentId : "",
      )}
    >
      <Text style={{ color: props.color, fontSize: props.size }}>✦</Text>
    </View>
  );
}
export function SkillPicker(props: PluginButtonContentProps) {
  const { theme, host, close } = props;
  const agentId = props.context === "agent" ? props.agentId : "";
  const provider = useAgent(agentId, (agent) => agent.provider);
  const marker = markerId(host.id, agentId);
  const [editor] = useState(() => resolveEditor(marker));
  const [error, setError] = useState("");
  const fetchStatus = useRpc(skillStatusRpc);
  const status = useQuery({
    queryKey: ["paseobility", host.id, "skills"],
    queryFn: () => fetchStatus({}),
    retry: false,
  });
  const s = palette(theme);
  return (
    <ScrollView
      style={{ maxHeight: 480 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
    >
      <Text style={s.heading}>Paseobility 스킬</Text>
      <Text style={s.muted}>
        작성 중인 내용에 추가합니다. 전송은 직접 해주세요.
      </Text>
      {Platform.OS !== "web" && (
        <Text style={s.body}>
          이 기기에서는 입력창 + 메뉴의 Paseobility 스킬을 선택해주세요.
        </Text>
      )}
      {status.isError && (
        <Text style={s.body}>
          설치 정보를 불러오지 못했습니다. 다시 열어주세요.
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.body}>
          {error}
        </Text>
      )}
      {WORKFLOWS.map((skill) => {
        const installed = status.data?.skills.some(
          (item) =>
            item.id === skill.id &&
            (provider?.startsWith("claude") ? item.claude : item.paseo),
        );
        return (
          <Pressable
            key={skill.id}
            accessibilityRole="button"
            accessibilityLabel={skill.title}
            disabled={!installed || Platform.OS !== "web"}
            onPress={() => {
              try {
                attachSkill(marker, editor, skill.id);
                close();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "스킬을 추가하지 못했습니다.",
                );
              }
            }}
            style={[s.row, { opacity: installed ? 1 : 0.65 }]}
          >
            <Text style={s.body}>
              {skill.title}
              {status.isSuccess && !installed ? " · 미설치" : ""}
            </Text>
            <Text style={s.muted}>/{skill.id}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
export function contributePills(client: PluginClientContext) {
  return followAgentPills(client, {
    title: "Paseobility",
    icon: PillIcon,
    behavior: { kind: "popover", Content: SkillPicker },
  });
}
