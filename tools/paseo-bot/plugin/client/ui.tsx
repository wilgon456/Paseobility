import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { laneOf, stateLabel } from "../shared/model";
import { statusTone, tagColors } from "../shared/colors";
const Theme = createContext<PluginTheme | null>(null);
export const UiProvider = Theme.Provider;
export function useUi() {
  const theme = useContext(Theme)!;
  const c = theme.colors;
  return {
    c,
    body: { color: c.foreground, fontSize: 14, lineHeight: 22 },
    small: { color: c.foregroundMuted, fontSize: 12, lineHeight: 18 },
    muted: { color: c.foregroundMuted, fontSize: 14, lineHeight: 22 },
    heading: {
      color: c.foreground,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: "600" as const,
    },
    panel: {
      backgroundColor: c.surface1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
    },
  };
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { live = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function Tag({ label, tone, maxWidth }: { label: string; tone: string; maxWidth?: number }) {
  const { c, small } = useUi();
  const colors = tagColors(c.surface1, c.foreground, tone);
  return <View testID="semantic-tag" style={{ backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth }}>
    <Text numberOfLines={1} accessibilityLabel={label} style={{ ...small, color: colors.foreground }}>{label}</Text>
  </View>;
}

export function MotionIn({ children, motionKey, direction = 0 }: { children: ReactNode; motionKey: string; direction?: number }) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    value.stopAnimation();
    if (reduced) { value.setValue(1); return; }
    value.setValue(0);
    const animation = Animated.timing(value, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [motionKey, reduced, value]);
  return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }, { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [direction * -12, 0] }) }] }}>{children}</Animated.View>;
}

function StatusIcon({ group, color }: { group: string; color: string }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.stopAnimation(); pulse.setValue(1); spin.stopAnimation(); spin.setValue(0);
    if (reduced) return;
    if (group === "success") {
      pulse.setValue(.6);
      const done = Animated.timing(pulse, { toValue: 1, duration: 240, useNativeDriver: true });
      done.start(); return () => { done.stop(); pulse.setValue(1); };
    }
    if (group !== "running") return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: .45, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    const rotation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    animation.start(); rotation.start(); return () => { animation.stop(); rotation.stop(); pulse.setValue(1); spin.setValue(0); };
  }, [group, reduced, pulse, spin]);
  return <Animated.View testID="status-icon" style={{ opacity: pulse, transform: [{ scale: group === "success" ? pulse : 1 }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><Glyph name={group === "success" ? "CircleCheck" : group === "failed" ? "CircleX" : group === "attention" ? "CircleAlert" : group === "running" ? "LoaderCircle" : "CircleDashed"} size={13} color={color} /></Animated.View>;
}

export function Glyph({
  name,
  size = 16,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const { c } = useUi();
  return <Icon name={name} size={size} color={color ?? c.foregroundMuted} />;
}
export function Button({
  label,
  onPress,
  icon,
  primary = false,
  quiet = false,
  disabled = false,
  selected = false,
  tone,
}: {
  label: string;
  onPress: () => void;
  icon?: string;
  primary?: boolean;
  quiet?: boolean;
  disabled?: boolean;
  selected?: boolean;
  tone?: string;
}) {
  const { c, body } = useUi();
  const tint = tone ? tagColors(c.surface1, c.foreground, tone) : null;
  const [hover, setHover] = useState(false),
    [press, setPress] = useState(false),
    [focus, setFocus] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPress(true)}
      onPressOut={() => setPress(false)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: focus
          ? c.accent
          : quiet && !selected
            ? "transparent"
            : tint?.border ?? c.border,
        backgroundColor: primary
          ? c.accent
          : hover || pressed || selected
            ? c.surface2
            : quiet
              ? "transparent"
              : tint?.background ?? c.surface1,
        opacity: disabled ? 0.45 : primary && pressed ? 0.75 : primary && hover ? 0.88 : 1,
      })}
    >
      {icon && (
        <Glyph
          name={icon}
          color={primary ? c.accentForeground : c.foregroundMuted}
        />
      )}
      <Text
        style={{
          ...body,
          fontWeight: "500",
          color: primary ? c.accentForeground : (hover || press ? c.foreground : tint?.foreground ?? c.foreground),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Badge({ state, label }: { state: string; label?: string }) {
  const { c, small } = useUi();
  const group = laneOf(state);
  const colors = tagColors(c.surface1, c.foreground, statusTone(group));
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
      <StatusIcon group={group} color={colors.foreground} />
      <Text style={{ ...small, color: colors.foreground, fontWeight: "500" }}>{label ?? stateLabel(state)}</Text>
    </View>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  tone,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (s: string) => void;
  disabled?: boolean;
  tone?: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const { c, body, small } = useUi();
  return (
    <View style={{ minWidth: 0 }}>
      <Button
        label={`${label}: ${options.find((o) => o.value === value)?.label ?? "선택"}`}
        icon="ChevronDown"
        tone={tone}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Modal title={label} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          {options.length > 8 && (
            <TextInput
              accessibilityLabel={`${label} 찾기`}
              value={search}
              onChangeText={setSearch}
              placeholder="이름으로 찾기"
              placeholderTextColor={c.foregroundMuted}
              style={{
                ...body,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 8,
                minHeight: 44,
                padding: 12,
              }}
            />
          )}
          <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
            {options
              .filter((o) =>
                o.label.toLowerCase().includes(search.toLowerCase()),
              )
              .map((o) => (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ checked: value === o.value }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  style={{
                    minHeight: 44,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor:
                      value === o.value ? c.surface2 : c.surface0,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={body}>{o.label}</Text>
                  </View>
                  {value === o.value && (
                    <Glyph name="Check" color={c.foreground} />
                  )}
                </Pressable>
              ))}
          </View>
          {options.length === 0 && (
            <Text style={small}>선택할 항목이 없습니다.</Text>
          )}
        </Modal.Content>
      </Modal>
    </View>
  );
}
export function Notice({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  const { c, body, muted } = useUi();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        padding: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: error ? c.statusWarning : c.border,
        borderRadius: 12,
        backgroundColor: c.surface1,
      }}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Glyph name={error ? "WifiOff" : "Info"} />
        <Text style={{ ...body, fontWeight: "600", flex: 1 }}>{title}</Text>
      </View>
      {children && (
        <View style={{ gap: 8 }}>
          {typeof children === "string" ? (
            <Text style={muted}>{children}</Text>
          ) : (
            children
          )}
        </View>
      )}
    </View>
  );
}
export function Skeleton({ label = "불러오는 중" }: { label?: string }) {
  const { c } = useUi();
  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ gap: 12, padding: 16 }}
    >
      {[0.8, 1, 0.6].map((w, i) => (
        <View
          key={i}
          style={{
            height: i === 1 ? 72 : 20,
            width: `${w * 100}%`,
            borderRadius: 8,
            backgroundColor: c.surface2,
          }}
        />
      ))}
    </View>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const t = useUi();
  return (
    <View
      style={{
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <Glyph name="MessageSquareDashed" size={24} />
      <Text style={t.heading}>{title}</Text>
      <Text style={t.muted}>{body}</Text>
      {action}
    </View>
  );
}
