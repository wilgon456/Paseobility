import { followAgentPills } from "./agent-pills";
import type {
  PluginClientContext,
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import { useRpc, useAgent } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextStyle } from "react-native";
import { WORKFLOWS } from "../shared/workflows";
import { skillStatusRpc } from "../shared/skills";
import { attachSkill, markerId, resolveEditor } from "./web";
import { useText } from "./i18n";
import { SafeIcon, tokens } from "./ui-compat";
function PillIcon(props: PluginButtonIconProps) {
  return (
    <View
      testID={markerId(
        props.host.id,
        props.context === "agent" ? props.agentId : "",
      )}
    >
      <SafeIcon
        name="Sparkles"
        size={props.size}
        color={props.color}
        fallback="✦"
      />
    </View>
  );
}
function matches(skill: (typeof WORKFLOWS)[number], query: string) {
  return `${skill.id} ${skill.title} ${skill.hint} ${skill.en.title} ${skill.en.hint}`
    .normalize("NFKC")
    .toLocaleLowerCase()
    .includes(query);
}
export function SkillPicker(props: PluginButtonContentProps) {
  const { theme, host, close } = props;
  const { t, locale, server } = useText();
  const agentId = props.context === "agent" ? props.agentId : "";
  const provider = useAgent(agentId, (agent) => agent.provider);
  const marker = markerId(host.id, agentId);
  const [editor] = useState(() => {
    try {
      return resolveEditor(marker);
    } catch (error) {
      console.warn(
        "[Paseobility] Could not resolve the composer editor",
        error,
      );
      return null;
    }
  });
  const unavailable = Platform.OS === "web" && !editor;
  const [error, setError] = useState("");
  const fetchStatus = useRpc(skillStatusRpc);
  const status = useQuery({
    queryKey: ["paseobility", host.id, "skills"],
    queryFn: () => fetchStatus({}),
    retry: false,
  });
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInput>(null);
  // The host popover takes focus while it animates in, which defeats autoFocus
  // on web. Retry a few times until the search box holds focus.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const timers = [60, 200, 400, 700].map((ms) =>
      setTimeout(() => {
        const input = searchRef.current;
        if (input && !input.isFocused()) input.focus();
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const s = tokens(theme);
  const c = s.c;
  const query = search.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = WORKFLOWS.filter((skill) => matches(skill, query));
  const blocked = Platform.OS !== "web" || unavailable;
  const installed = (id: string) =>
    !!status.data?.skills.some(
      (item) =>
        item.id === id &&
        (provider?.startsWith("claude") ? item.claude : item.paseo),
    );
  const isDisabled = (id: string) => blocked || !installed(id);
  const notice = {
    ...s.caption,
    paddingHorizontal: 12,
    paddingVertical: 8,
  };
  const pick = (id: string) => {
    try {
      attachSkill(marker, editor, id);
      close();
    } catch (e) {
      setError(e instanceof Error ? server(e.message) : t("addFailed"));
    }
  };
  const searchInputStyle: TextStyle = {
    ...s.body,
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  };
  return (
    <View
      style={{
        width: props.layout.compact ? "100%" : 360,
        maxWidth: "100%",
        maxHeight: 480,
        flexDirection: "column",
      }}
    >
      <View
        style={{
          height: 44,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <SafeIcon
          name="Sparkles"
          size={16}
          color={c.foreground}
          fallback="✦"
        />
        <Text style={s.label}>Paseobility</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.caption} accessibilityLiveRegion="polite">
          {t("pickerCount", { count: visible.length })}
        </Text>
      </View>
      <View
        style={{
          height: 40,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <SafeIcon
          name="Search"
          size={14}
          color={c.foregroundMuted}
          fallback="⌕"
        />
        <TextInput
          ref={searchRef}
          accessibilityLabel={t("pickerSearch")}
          placeholder={t("pickerSearch")}
          placeholderTextColor={c.foregroundMuted}
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setActive(0);
          }}
          autoFocus={Platform.OS === "web"}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          onKeyPress={(event) => {
            const key = event.nativeEvent.key;
            if (key === "ArrowDown" || key === "ArrowUp") {
              if (visible.length) {
                setActive((current) =>
                  key === "ArrowDown"
                    ? Math.min(current + 1, visible.length - 1)
                    : Math.max(current - 1, 0),
                );
              }
              if (event.preventDefault) event.preventDefault();
              return;
            }
            if (key === "Enter") {
              const skill = visible[active];
              if (skill && !isDisabled(skill.id)) {
                if (event.preventDefault) event.preventDefault();
                pick(skill.id);
              }
            }
          }}
          style={[
            searchInputStyle,
            Platform.OS === "web"
              ? ({ outlineStyle: "none" } as unknown as TextStyle)
              : undefined,
          ]}
        />
      </View>
      <View style={{ height: 1, backgroundColor: c.border }} />
      {Platform.OS !== "web" && (
        <Text style={notice}>{t("pickerMobile")}</Text>
      )}
      {Platform.OS === "web" && unavailable && (
        <Text accessibilityRole="alert" style={notice}>
          {t("editorUnavailable")}
        </Text>
      )}
      {status.isPending && <Text style={notice}>{t("pickerLoading")}</Text>}
      {status.isError && (
        <Text accessibilityRole="alert" style={notice}>
          {t("pickerLoadError")}
        </Text>
      )}
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ ...notice, color: c.statusDanger }}
        >
          {error}
        </Text>
      )}
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ padding: 4 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 && (
          <View
            style={{
              paddingVertical: 24,
              paddingHorizontal: 12,
              gap: 4,
              alignItems: "center",
            }}
          >
            <Text style={s.body}>{t("pickerEmpty")}</Text>
            <Text style={s.caption}>{t("pickerEmptyHint")}</Text>
          </View>
        )}
        {visible.map((skill, index) => {
          const disabled = isDisabled(skill.id);
          const title = locale === "ko" ? skill.title : skill.en.title;
          const hint = locale === "ko" ? skill.hint : skill.en.hint;
          const isActive = index === active;
          return (
            <Pressable
              key={skill.id}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint={`/${skill.id}. ${hint}. ${t("pickerAddHint")}`}
              accessibilityState={{ disabled, selected: isActive }}
              disabled={disabled}
              onHoverIn={() => setActive(index)}
              onFocus={() => setFocused(skill.id)}
              onBlur={() => setFocused(null)}
              onPress={() => pick(skill.id)}
              style={({ pressed }) => ({
                minHeight: 40,
                paddingHorizontal: 8,
                paddingVertical: 8,
                borderRadius: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor:
                  pressed || focused === skill.id || isActive
                    ? c.surface2
                    : "transparent",
                opacity: disabled ? 0.55 : 1,
              })}
            >
              <SafeIcon
                name={skill.icon}
                size={16}
                color={disabled ? c.foregroundMuted : c.foreground}
                fallback={skill.glyph}
              />
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <Text style={{ ...s.label, flexShrink: 0 }}>{title}</Text>
                <Text numberOfLines={1} style={{ ...s.muted, flexShrink: 1 }}>
                  {hint}
                </Text>
              </View>
              {status.isSuccess && !installed(skill.id) && (
                <Text style={s.caption}>{t("notInstalled")}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function contributePills(client: PluginClientContext) {
  try {
    return followAgentPills(client, {
      title: "Paseobility",
      icon: PillIcon,
      behavior: { kind: "popover", Content: SkillPicker },
    });
  } catch (error) {
    // The sidebar, updater and + menu stay available without the private adapter.
    console.warn(
      "[Paseobility] Composer pill unavailable; use the + menu instead",
      error,
    );
    return () => {};
  }
}
