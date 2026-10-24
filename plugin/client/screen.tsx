import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { versionRpc, updateRpc } from "../shared/management";
export function palette(theme: PluginTheme) {
  const c = theme.colors;
  const body = {
    color: c.foreground,
    fontFamily:
      Platform.OS === "web"
        ? '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
        : undefined,
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
  const read = useRpc(versionRpc),
    update = useRpc(updateRpc);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef(false);
  const status = useQuery({
    queryKey: ["paseobility", host.id, "version"],
    queryFn: () => read({ hostId: host.id }),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.job?.phase === "running" ? 3000 : 60000,
  });
  const data = status.data,
    s = palette(theme);
  const running = busy || data?.job?.phase === "running";
  const newer = data?.latest && compare(data.latest.version, data.plugin) > 0;
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
      setMessage(
        "업데이트를 시작했습니다. 화면이 잠시 다시 연결될 수 있습니다.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "업데이트 요청을 확인하지 못했습니다. 상태를 새로고침해주세요.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      void status.refetch();
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{
        padding: layout.compact ? 16 : 24,
        gap: 24,
        maxWidth: 720,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 8 }}>
        <Text style={{ ...s.heading, fontSize: 24, lineHeight: 36 }}>
          Paseobility
        </Text>
        <Text style={s.muted}>{host.label}의 버전과 업데이트</Text>
      </View>
      {status.isPending && (
        <Text style={s.body}>버전을 확인하고 있습니다…</Text>
      )}
      {status.isError && (
        <Text accessibilityRole="alert" style={s.body}>
          이 컴퓨터에 연결하지 못했습니다. 연결 상태를 확인해주세요.
        </Text>
      )}
      {data && (
        <View style={{ gap: 16 }}>
          <View style={s.row}>
            <Text style={s.muted}>현재 플러그인</Text>
            <Text style={s.heading}>v{data.plugin}</Text>
            <Text style={s.muted}>
              설치된 스킬 ·{" "}
              {data.installed ? `v${data.installed}` : "버전 미확인"}
            </Text>
          </View>
          <View style={s.row}>
            <Text style={s.muted}>최신 정식 버전</Text>
            <Text style={s.heading}>
              {data.latest ? `v${data.latest.version}` : "확인하지 못함"}
            </Text>
            <Text style={s.muted}>
              {data.error ||
                (newer
                  ? "새 버전을 설치할 수 있습니다."
                  : "현재 플러그인은 최신 정식 버전 이상입니다.")}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Paseobility 업데이트"
            disabled={!newer || running}
            onPress={() => void install()}
            style={[s.button, { opacity: !newer || running ? 0.65 : 1 }]}
          >
            <Text style={s.buttonText}>
              {running
                ? "업데이트 중…"
                : !data.latest
                  ? "버전 확인 필요"
                  : newer
                    ? `v${data.latest!.version}로 업데이트`
                    : "최신 버전 사용 중"}
            </Text>
          </Pressable>
          <Text style={s.muted}>
            이 컴퓨터의 플러그인과 Paseobility 스킬을 업데이트합니다. 기존
            스킬은 백업하고, 실행 중인 Paseo는 재시작하지 않습니다.
          </Text>
          {data.job && (
            <View style={s.row}>
              <Text style={s.body}>{data.job.message}</Text>
              {data.job.backup && (
                <Text style={s.muted}>백업: {data.job.backup}</Text>
              )}
            </View>
          )}
        </View>
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={s.body}>
          {message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="버전 새로고침"
        onPress={() => void status.refetch()}
        style={s.row}
      >
        <Text style={s.body}>버전 새로고침</Text>
      </Pressable>
      <View style={{ gap: 8 }}>
        <Text style={s.heading}>스킬은 대화에서 선택하세요</Text>
        <Text style={s.body}>
          입력창 위 Paseobility에서 스킬을 고르면 작성 중인 내용에 추가됩니다.
          내용을 확인한 뒤 평소처럼 전송하세요.
        </Text>
        <Text style={s.muted}>
          모바일 앱에서는 입력창 + 메뉴의 Paseobility 스킬을 이용할 수 있습니다.
        </Text>
      </View>
    </ScrollView>
  );
}
function compare(a: string, b: string) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
