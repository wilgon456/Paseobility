import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, TextInput, View } from "react-native";
import type { Workflow } from "../shared/contracts";
import { laneOf, stageLabel, stageProgress, stateLabel } from "../shared/model";
import { statusTone, tagColors, toneInk } from "../shared/colors";
import { stagesOf } from "./workflow";
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
      borderRadius: 14,
    },
    // Two elevations: resting cards and hovered/raised surfaces.
    shadow: (raised = false) => ({
      shadowColor: "#000000",
      shadowOpacity: raised ? 0.14 : 0.06,
      shadowRadius: raised ? 16 : 6,
      shadowOffset: { width: 0, height: raised ? 6 : 2 },
    }),
    tint: (tone: string, mix = 0.16, surface: string = c.surface1) => tagColors(surface, c.foreground, tone, mix),
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

/** Pill tag. The label Text is the first element so its color is the one checked for contrast. */
export function Tag({ label, tone, maxWidth, dot = false, surface }: { label: string; tone: string; maxWidth?: number; dot?: boolean; surface?: string }) {
  const { c, small } = useUi();
  const colors = tagColors(surface ?? c.surface1, c.foreground, tone);
  return <View testID="semantic-tag" style={{ backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth, flexShrink: 0 }}>
    <Text numberOfLines={1} accessibilityLabel={label} style={{ ...small, color: colors.foreground, fontWeight: "500" }}>
      {dot && <Text style={{ color: toneInk(tone) }}>{"● "}</Text>}
      {label}
    </Text>
  </View>;
}

export function MotionIn({ children, motionKey, direction = 0 }: { children: ReactNode; motionKey: string; direction?: number }) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    value.stopAnimation();
    if (reduced) { value.setValue(1); return; }
    value.setValue(0);
    const animation = Animated.timing(value, { toValue: 1, duration: direction ? 320 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [motionKey, reduced, value]);
  return <Animated.View style={{ opacity: value, transform: [
    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [direction ? 0 : 8, 0] }) },
    { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [direction * -28, 0] }) },
    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [direction ? 0.96 : 0.99, 1] }) },
  ] }}>{children}</Animated.View>;
}

export function StatusIcon({ group, color, size = 13 }: { group: string; color: string; size?: number }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.stopAnimation(); pulse.setValue(1); spin.stopAnimation(); spin.setValue(0);
    if (reduced) return;
    if (group === "success") {
      pulse.setValue(.4);
      const done = Animated.spring(pulse, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true });
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
  return <Animated.View testID="status-icon" style={{ opacity: group === "success" ? 1 : pulse, transform: [{ scale: group === "success" ? pulse : 1 }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><Glyph name={group === "success" ? "CircleCheck" : group === "failed" ? "CircleX" : group === "attention" ? "CircleAlert" : group === "running" ? "LoaderCircle" : "CircleDashed"} size={size} color={color} /></Animated.View>;
}

/** Stage track (two stages for daily, four for verified): completed stages fill, the active one breathes while running. */
export function StageRail({ state, stage, workflow }: { state: string; stage: string; workflow?: Workflow }) {
  const { c, small } = useUi();
  const reduced = useReducedMotion();
  const group = laneOf(state);
  const stages = stagesOf(workflow), n = stages.length;
  const done = Math.min(stageProgress(state, stage), n);
  const ink = toneInk(statusTone(group));
  const glow = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    glow.stopAnimation(); glow.setValue(1);
    if (reduced || group !== "running") return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: .35, duration: 650, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    loop.start(); return () => { loop.stop(); glow.setValue(1); };
  }, [group, reduced, glow]);
  const caption = group === "success" ? `${n}/${n}` : group === "waiting" ? "시작 전" : `${Math.min(done + 1, n)}/${n}`;
  return <View testID="stage-rail" accessibilityLabel={`진행 ${caption} ${group === "waiting" ? "" : stageLabel(stages[Math.min(done, n - 1)])}`.trim()} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
    <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
      {stages.map((s, i) => {
        const filled = i < done || group === "success";
        const current = i === done && group !== "success" && group !== "waiting";
        return <View key={s} style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: c.surface2, overflow: "hidden" }}>
          {(filled || current) && <Animated.View style={{ flex: 1, borderRadius: 999, backgroundColor: ink, opacity: current ? (group === "running" ? glow : 0.55) : 1 }} />}
        </View>;
      })}
    </View>
    <Text style={{ ...small, minWidth: 40, textAlign: "right" }}>{caption}</Text>
  </View>;
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
  badge,
  iconOnly = false,
  round = false,
}: {
  label: string;
  onPress: () => void;
  icon?: string;
  primary?: boolean;
  quiet?: boolean;
  disabled?: boolean;
  selected?: boolean;
  tone?: string;
  badge?: number;
  iconOnly?: boolean;
  round?: boolean;
}) {
  const t = useUi(), { c, body } = t;
  const tint = tone ? t.tint(tone) : null;
  const strong = tone ? t.tint(tone, 0.26) : null;
  const [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false);
  const active = hover && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: iconOnly ? 44 : undefined,
        paddingHorizontal: iconOnly ? (badge ? 8 : 0) : 16,
        paddingVertical: 8,
        borderRadius: round ? 999 : 10,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: focus
          ? c.accent
          : primary
            ? c.accent
            : quiet && !selected && !active
              ? "transparent"
              : (active ? strong?.border : tint?.border) ?? c.border,
        backgroundColor: primary
          ? c.accent
          : selected
            ? strong?.background ?? c.surface2
            : active || pressed
              ? strong?.background ?? c.surface2
              : quiet
                ? "transparent"
                : tint?.background ?? c.surface1,
        opacity: disabled ? 0.45 : primary && pressed ? 0.8 : primary && active ? 0.9 : 1,
        transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        ...(primary && active ? t.shadow(true) : {}),
      })}
    >
      {icon && (
        <Glyph
          name={icon}
          color={primary ? c.accentForeground : tint ? tint.foreground : active || selected ? c.foreground : c.foregroundMuted}
        />
      )}
      {!iconOnly && <Text
        style={{
          ...body,
          fontWeight: "500",
          color: primary ? c.accentForeground : tint?.foreground ?? c.foreground,
        }}
      >
        {label}
      </Text>}
      {!!badge && <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: c.accent }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: c.accentForeground }}>{badge}</Text>
      </View>}
    </Pressable>
  );
}
export function Badge({ state, label }: { state: string; label?: string }) {
  const { c, small } = useUi();
  const group = laneOf(state);
  const colors = tagColors(c.surface1, c.foreground, statusTone(group));
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
      <StatusIcon group={group} color={colors.foreground} />
      <Text style={{ ...small, color: colors.foreground, fontWeight: "600" }}>{label ?? stateLabel(state)}</Text>
    </View>
  );
}
export type Option = { value: string; label: string; note?: string; tone?: string; icon?: string };
/** Inline two-to-four way choice; each option is a radio named by its label. */
export function Segmented({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const { c } = useUi();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignSelf: "flex-start", borderWidth: 1, borderColor: c.border, borderRadius: 999, backgroundColor: c.surface0, opacity: disabled ? 0.45 : 1 }}
    >
      {options.map((o) => (
        <Segment key={o.value} option={o} checked={o.value === value} disabled={disabled} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}
function Segment({ option, checked, disabled, onPress }: { option: Option; checked: boolean; disabled: boolean; onPress: () => void }) {
  const t = useUi(), { c, body } = t;
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false);
  const wash = t.tint(option.tone ?? "gray", checked ? 0.22 : hover && !disabled ? 0.1 : 0, c.surface0);
  const ink = checked ? wash.foreground : c.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: focus ? c.accent : "transparent",
        backgroundColor: checked || (hover && !disabled) ? wash.background : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
      })}
    >
      {option.icon && <Glyph name={option.icon} size={14} color={ink} />}
      <Text numberOfLines={1} style={{ ...body, fontWeight: checked ? "600" : "500", color: ink }}>{option.label}</Text>
    </Pressable>
  );
}
/** Chip-shaped picker. The accessible name stays "label: value". */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  tone,
  icon,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (s: string) => void;
  disabled?: boolean;
  tone?: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false);
  const t = useUi(), { c, body, small } = t;
  const current = options.find((o) => o.value === value);
  const colors = t.tint(tone ?? "gray", hover && !disabled ? 0.24 : 0.12);
  return (
    <View style={{ minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? "선택"}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: focus ? c.accent : colors.border,
          backgroundColor: colors.background,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        })}
      >
        {icon && <Glyph name={icon} size={14} color={colors.foreground} />}
        <Text numberOfLines={1} style={{ ...small, color: colors.foreground }}>{label}</Text>
        <Text numberOfLines={1} style={{ ...body, fontWeight: "600", color: colors.foreground, flexShrink: 1 }}>{current?.label ?? "선택"}</Text>
        <Glyph name="ChevronDown" size={14} color={colors.foreground} />
      </Pressable>
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
                borderRadius: 10,
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
                  style={(state) => ({
                    minHeight: 44,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor:
                      value === o.value || (state as { hovered?: boolean }).hovered ? c.surface2 : c.surface0,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  })}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: toneInk(o.tone ?? "gray") }} />
                  <View style={{ flex: 1 }}>
                    <Text style={body}>{o.label}</Text>
                    {!!o.note && <Text style={small}>{o.note}</Text>}
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
  tone,
  icon,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
  tone?: string;
  icon?: string;
}) {
  const t = useUi(), { body, muted } = t;
  const colors = t.tint(tone ?? (error ? "red" : "blue"), 0.08);
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        padding: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Glyph name={icon ?? (error ? "WifiOff" : "Info")} color={toneInk(tone ?? (error ? "red" : "blue"))} />
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
  const reduced = useReducedMotion();
  const shimmer = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: .5, duration: 700, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [reduced, shimmer]);
  return (
    <Animated.View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ gap: 12, padding: 16, opacity: shimmer }}
    >
      {[0.8, 1, 0.6].map((w, i) => (
        <View
          key={i}
          style={{
            height: i === 1 ? 72 : 20,
            width: `${w * 100}%`,
            borderRadius: 10,
            backgroundColor: c.surface2,
          }}
        />
      ))}
    </Animated.View>
  );
}
export function Empty({
  title,
  body,
  action,
  icon = "MessageSquareDashed",
  tone = "blue",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: string;
  tone?: string;
}) {
  const t = useUi();
  const colors = t.tint(tone, 0.16, t.c.surface0);
  return (
    <View
      style={{
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
        <Glyph name={icon} size={24} color={toneInk(tone)} />
      </View>
      <Text style={t.heading}>{title}</Text>
      <Text style={t.muted}>{body}</Text>
      {action}
    </View>
  );
}
