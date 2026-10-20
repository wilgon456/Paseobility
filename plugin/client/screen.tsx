import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SKILLS, skillStatusRpc } from "../shared/skills";
import { openExternal } from "./web";

const REPO_URL = "https://github.com/wilgon456/Paseobility";

export function SkillsScreen({ theme, layout }: PluginScreenProps) {
  const fetchStatus = useRpc(skillStatusRpc);
  const status = useQuery({
    queryKey: ["paseobility", "skillStatus"],
    queryFn: () => fetchStatus({}),
  });
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 16 : 24, gap: 12 },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 20 : 24 },
      muted: { color: theme.colors.foregroundMuted },
      row: { gap: 4, paddingVertical: 8 },
      name: { color: theme.colors.foreground, fontWeight: "600" as const },
      button: { padding: 12, backgroundColor: theme.colors.accent, alignSelf: "flex-start" as const },
      buttonText: { color: theme.colors.accentForeground },
    }),
    [theme, layout.compact],
  );
  const byId = new Map((status.data?.skills ?? []).map((s) => [s.id, s]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Paseobility skills</Text>
      <Text style={styles.muted}>
        Install state is read from ~/.agents/skills (Paseo) and ~/.claude/skills (Claude) on the daemon host.
      </Text>
      {status.isError ? <Text style={styles.muted}>Could not read install status.</Text> : null}
      {SKILLS.map((skill) => {
        const s = byId.get(skill.id);
        const state = !s ? "checking" : [s.paseo ? "Paseo" : null, s.claude ? "Claude" : null].filter(Boolean).join(", ") || "not installed";
        return (
          <View key={skill.id} style={styles.row}>
            <Text style={styles.name}>{skill.id}</Text>
            <Text style={styles.muted}>{skill.summary}</Text>
            <Text style={styles.muted}>Installed: {state}</Text>
          </View>
        );
      })}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open the Paseobility repository"
        style={styles.button}
        onPress={() => openExternal(REPO_URL)}
      >
        <Text style={styles.buttonText}>Open repository</Text>
      </Pressable>
    </ScrollView>
  );
}
