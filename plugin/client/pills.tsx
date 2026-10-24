import { followAgentPills } from "./agent-pills";
import type {
  PluginClientContext,
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import { useRpc, useAgent } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const s = palette(theme);
  const c = theme.colors;
  const query = search.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = WORKFLOWS.filter((skill) =>
    `${skill.id} ${skill.title} ${skill.hint}`
      .normalize("NFKC")
      .toLocaleLowerCase()
      .includes(query),
  );
  const caption = { ...s.muted, fontSize: 12, lineHeight: 20 };
  return (
    <View
      style={{
        width: props.layout.compact ? "100%" : 360,
        maxWidth: "100%",
        maxHeight: 520,
        padding: 12,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text style={{ ...s.body, fontWeight: "600" }}>Paseobility</Text>
        <Text style={caption} accessibilityLiveRegion="polite">
          {visible.length}개 스킬
        </Text>
      </View>
      <TextInput
        accessibilityLabel="Paseobility 스킬 검색"
        placeholder="스킬 검색…"
        placeholderTextColor={c.foregroundMuted}
        value={search}
        onChangeText={setSearch}
        autoFocus={Platform.OS === "web"}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        onFocus={() => setFocused("search")}
        onBlur={() => setFocused(null)}
        style={{
          ...s.body,
          height: 44,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: focused === "search" ? c.foregroundMuted : c.border,
          borderRadius: 8,
          backgroundColor: c.surface0,
        }}
      />
      {Platform.OS !== "web" && (
        <Text style={caption}>입력창 + 메뉴에서 스킬을 추가해주세요.</Text>
      )}
      {status.isPending && (
        <Text style={caption}>설치 정보를 확인하고 있습니다…</Text>
      )}
      {status.isError && (
        <Text accessibilityRole="alert" style={caption}>
          설치 정보를 불러오지 못했습니다. 다시 열어주세요.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.body}>
          {error}
        </Text>
      )}
      <ScrollView
        style={{ maxHeight: 344, flexShrink: 1 }}
        contentContainerStyle={{ gap: 4 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 24, gap: 4 }}>
            <Text style={s.body}>검색 결과가 없습니다</Text>
            <Text style={caption}>스킬명이나 작업 내용으로 검색해보세요.</Text>
          </View>
        )}
        {visible.map((skill) => {
          const installed = status.data?.skills.some(
            (item) =>
              item.id === skill.id &&
              (provider?.startsWith("claude") ? item.claude : item.paseo),
          );
          const disabled = !installed || Platform.OS !== "web";
          return (
            <Pressable
              key={skill.id}
              accessibilityRole="button"
              accessibilityLabel={skill.title}
              accessibilityHint={`${skill.id}. ${skill.hint}. 입력창에 추가합니다.`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onHoverIn={() => setHovered(skill.id)}
              onHoverOut={() => setHovered(null)}
              onFocus={() => setFocused(skill.id)}
              onBlur={() => setFocused(null)}
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
              style={({ pressed }) => ({
                minHeight: 64,
                paddingHorizontal: 8,
                paddingVertical: 8,
                gap: 0,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  focused === skill.id ? c.foregroundMuted : "transparent",
                backgroundColor: pressed
                  ? c.surface2
                  : hovered === skill.id || focused === skill.id
                    ? c.surface1
                    : "transparent",
              })}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{
                    ...s.body,
                    color: disabled ? c.foregroundMuted : c.foreground,
                    fontWeight: "500",
                    flexShrink: 1,
                  }}
                >
                  {skill.id}
                </Text>
                {status.isSuccess && !installed && (
                  <Text style={caption}>미설치</Text>
                )}
              </View>
              <Text numberOfLines={2} style={caption}>
                {skill.title} · {skill.hint}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function contributePills(client: PluginClientContext) {
  return followAgentPills(client, {
    title: "Paseobility",
    icon: PillIcon,
    behavior: { kind: "popover", Content: SkillPicker },
  });
}
