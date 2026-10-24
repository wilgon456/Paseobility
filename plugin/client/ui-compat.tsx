import * as uiSdk from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import type { ComponentType } from "react";
import { Platform, Text, View } from "react-native";
export { withAlpha } from "../shared/color";

// Paseo 0.13 exports Icon from @getpaseo/plugin/client/ui; 0.12 does not.
// Read it through the namespace so a 0.12 host never sees a missing named import.
const HostIcon = (uiSdk as Record<string, unknown>).Icon as
  | ComponentType<{ name: string; size?: number; color?: string }>
  | undefined;
export const HAS_HOST_ICON =
  typeof HostIcon === "function" ||
  (typeof HostIcon === "object" && HostIcon !== null);

/** A Lucide icon from the host on 0.13; a short text glyph on 0.12. */
export function SafeIcon({
  name,
  size = 16,
  color,
  fallback = "•",
}: {
  name: string;
  size?: number;
  color: string;
  fallback?: string;
}) {
  if (HAS_HOST_ICON && HostIcon) {
    return <HostIcon name={name} size={size} color={color} />;
  }
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Text
        style={{
          color,
          fontSize: Math.round(size * 0.8),
          lineHeight: size,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {fallback}
      </Text>
    </View>
  );
}

/**
 * Paseo's own type scale and surfaces, measured from the 0.13 web app:
 * system font (no fontFamily override), 14px body, 12-13px secondary text,
 * 24px page titles, 8px radii and 1px theme borders.
 */
export function tokens(theme: PluginTheme) {
  const c = theme.colors;
  return {
    c,
    title: { color: c.foreground, fontSize: 24, lineHeight: 32, fontWeight: "600" as const },
    heading: { color: c.foreground, fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
    body: { color: c.foreground, fontSize: 14, lineHeight: 20 },
    label: { color: c.foreground, fontSize: 14, lineHeight: 20, fontWeight: "500" as const },
    muted: { color: c.foregroundMuted, fontSize: 13, lineHeight: 18 },
    caption: { color: c.foregroundMuted, fontSize: 12, lineHeight: 16 },
    section: { color: c.foregroundMuted, fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
    mono: {
      color: c.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: Platform.select({
        web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        ios: "Menlo",
        default: "monospace",
      }),
    },
    card: {
      backgroundColor: c.surface1,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
    },
    radius: 8,
  };
}
export type Tokens = ReturnType<typeof tokens>;
