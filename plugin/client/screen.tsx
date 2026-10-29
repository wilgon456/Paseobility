import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import {
  ExternalLink,
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { versionRpc, updateRpc } from "../shared/management";
import { skillStatusRpc } from "../shared/skills";
import { WORKFLOWS } from "../shared/workflows";
import { useText } from "./i18n";
import { SafeIcon, tokens, withAlpha } from "./ui-compat";
export function palette(theme: PluginTheme) {
  const c = theme.colors;
  const body = {
    color: c.foreground,
    fontSize: 14,
    lineHeight: 24,
  };
  return {
    body,
    muted: { ...body, color: c.foregroundMuted },
    heading: {
      ...body,
      fontSize: 18,
      lineHeight: 28,
      fontWeight: "600" as const,
    },
    row: {
      padding: 12,
      gap: 4,
      borderRadius: 8,
      backgroundColor: c.surface1,
      minHeight: 44,
    },
    button: {
      padding: 12,
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: c.accent,
    },
    buttonText: {
      ...body,
      color: c.accentForeground,
      textAlign: "center" as const,
    },
  };
}
export function VersionScreen(props: PluginScreenProps) {
  return <Management key={props.host.id} {...props} />;
}
function Management({ theme, layout, host }: PluginScreenProps) {
  const { t, locale, server, job } = useText();
  const read = useRpc(versionRpc),
    update = useRpc(updateRpc);
  const fetchSkills = useRpc(skillStatusRpc);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [refreshHover, setRefreshHover] = useState(false),
    [gridWidth, setGridWidth] = useState(0);
  const pending = useRef(false);
  const tk = tokens(theme);
  const c = tk.c;
  const status = useQuery({
    queryKey: ["paseobility", host.id, "version"],
    queryFn: () => read({ hostId: host.id }),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.job?.phase === "running" ? 3000 : 60000,
  });
  const skills = useQuery({
    queryKey: ["paseobility", host.id, "skills"],
    queryFn: () => fetchSkills({}),
    retry: false,
  });
  const data = status.data;
  const isInstalled = (id: string) =>
    Boolean(
      skills.data?.skills.some(
        (item) => item.id === id && (item.paseo || item.claude),
      ),
    );
  const installedCount = skills.data
    ? WORKFLOWS.filter((skill) => isInstalled(skill.id)).length
    : 0;
  const running = busy || data?.job?.phase === "running";
  const newer = Boolean(
    data?.latest && compare(data.latest.version, data.plugin) > 0,
  );
  async function install() {
    if (pending.current || !data?.latest) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await update({
        hostId: host.id,
        version: data.latest.version,
        sha: data.latest.sha,
      });
      setMessage(t("updateStarted"));
    } catch (e) {
      setMessage(e instanceof Error ? server(e.message) : t("updateUnconfirmed"));
    } finally {
      pending.current = false;
      setBusy(false);
      void status.refetch();
    }
  }
  const badge = status.isPending
    ? { label: t("statusUnknown"), color: c.foregroundMuted }
    : status.isError
      ? { label: t("statusOffline"), color: c.statusDanger }
      : running
        ? { label: t("statusUpdating"), color: c.accent }
        : newer
          ? { label: t("statusUpdate"), color: c.statusWarning }
          : { label: t("statusLatest"), color: c.statusSuccess };
  // Two columns keep full command names visible inside the 688px column.
  const cols = gridWidth >= 380 ? 2 : 1;
  const tileWidth =
    gridWidth > 0 ? Math.floor((gridWidth - 8 * (cols - 1)) / cols) : 0;
  const value = (text: string, missing: boolean) => (
    <Text
      style={[
        tk.body,
        { fontVariant: ["tabular-nums"] },
        missing && { color: c.foregroundMuted },
      ]}
    >
      {text}
    </Text>
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface0 }}
      contentContainerStyle={{
        paddingHorizontal: layout.compact ? 16 : 24,
        paddingTop: layout.compact ? 16 : 32,
        paddingBottom: layout.compact ? 16 : 24,
        gap: 24,
        maxWidth: 688,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accent,
          }}
        >
          <SafeIcon
            name="Sparkles"
            size={24}
            color={c.accentForeground}
            fallback="✦"
          />
        </View>
        <View style={{ flex: 1, gap: 4, minWidth: 160 }}>
          <Text style={tk.title}>Paseobility</Text>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <SafeIcon
              name="Monitor"
              size={14}
              color={c.foregroundMuted}
              fallback="▣"
            />
            <Text numberOfLines={1} style={{ ...tk.muted, flexShrink: 1 }}>
              {host.label}
            </Text>
          </View>
        </View>
        <View
          accessibilityLiveRegion="polite"
          style={{
            height: 24,
            paddingHorizontal: 10,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: withAlpha(badge.color, 0.14, c.surface2),
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: badge.color,
            }}
          />
          <Text
            style={{
              color: badge.color,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: "500",
            }}
          >
            {badge.label}
          </Text>
        </View>
      </View>

      <SettingsSection
        title={t("sectionVersion")}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("refresh")}
            onHoverIn={() => setRefreshHover(true)}
            onHoverOut={() => setRefreshHover(false)}
            onPress={() => void status.refetch()}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                pressed || refreshHover ? c.surface2 : "transparent",
            })}
          >
            <SafeIcon
              name="RefreshCw"
              size={14}
              color={c.foregroundMuted}
              fallback="↻"
            />
          </Pressable>
        }
      >
        {status.isPending ? (
          <SettingsCard>
            <SettingsRow label={t("checking")}>
              <ActivityIndicator size="small" color={c.foregroundMuted} />
            </SettingsRow>
          </SettingsCard>
        ) : status.isError ? (
          <SettingsCard>
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text
                accessibilityRole="alert"
                style={{ ...tk.body, color: c.statusDanger }}
              >
                {t("offline")}
              </Text>
            </View>
          </SettingsCard>
        ) : data ? (
          <SettingsCard>
            <SettingsRow label={t("rowPlugin")} hint={t("rowPluginHint")}>
              {value(`v${data.plugin}`, false)}
            </SettingsRow>
            <SettingsRow label={t("rowSkills")} hint={t("rowSkillsHint")}>
              {data.installed
                ? value(`v${data.installed}`, false)
                : value(t("notDetected"), true)}
            </SettingsRow>
            <SettingsRow
              label={t("rowLatest")}
              hint={data.error ? server(data.error) : t("rowLatestHint")}
            >
              {data.latest
                ? value(`v${data.latest.version}`, false)
                : value(t("unavailable"), true)}
            </SettingsRow>
            <SettingsAction
              label={t("actionUpdate")}
              hint={t("updateHint")}
              actionLabel={
                running
                  ? t("actionUpdating")
                  : newer && data.latest
                    ? t("actionUpdateTo", { version: data.latest.version })
                    : t("actionLatest")
              }
              disabled={!newer || running}
              onPress={() => void install()}
            />
          </SettingsCard>
        ) : null}
        {data?.job && (
          <SettingsCard>
            <SettingsRow
              label={job(data.job)}
              hint={
                data.job.backup
                  ? `${t("backup")}: ${data.job.backup}`
                  : undefined
              }
            />
          </SettingsCard>
        )}
        {!!message && (
          <Text accessibilityRole="alert" style={tk.muted}>
            {message}
          </Text>
        )}
      </SettingsSection>

      <SettingsSection
        title={t("sectionSkills")}
        trailing={
          skills.isSuccess ? (
            <Text style={tk.caption}>
              {t("installedCount", {
                installed: installedCount,
                total: WORKFLOWS.length,
              })}
            </Text>
          ) : undefined
        }
      >
        <View
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {WORKFLOWS.map((skill) => {
            const installed = isInstalled(skill.id);
            const title = locale === "ko" ? skill.title : skill.en.title;
            return (
              <View
                key={skill.id}
                accessible
                accessibilityLabel={`${title}, /${skill.id}${
                  skills.isSuccess && !installed
                    ? `, ${t("notInstalled")}`
                    : ""
                }`}
                style={[
                  tk.card,
                  {
                    width: tileWidth > 0 ? tileWidth : "100%",
                    padding: 12,
                    minHeight: 64,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  },
                ]}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.surface2,
                  }}
                >
                  <SafeIcon
                    name={skill.icon}
                    size={16}
                    color={installed ? c.foreground : c.foregroundMuted}
                    fallback={skill.glyph}
                  />
                </View>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={tk.label}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} style={tk.mono}>
                    /{skill.id}
                  </Text>
                </View>
                {skills.isSuccess && !installed && (
                  <Text style={tk.caption}>{t("notInstalled")}</Text>
                )}
              </View>
            );
          })}
        </View>
      </SettingsSection>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <SafeIcon
          name="Info"
          size={14}
          color={c.foregroundMuted}
          fallback="i"
        />
        <Text style={[tk.muted, { flexShrink: 1 }]}>{t("howTo")}</Text>
        <ExternalLink href="https://github.com/wilgon456/Paseobility/releases">
          {t("releaseNotes")}
        </ExternalLink>
      </View>
    </ScrollView>
  );
}
function compare(a: string, b: string) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
