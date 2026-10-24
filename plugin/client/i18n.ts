import * as clientSdk from "@getpaseo/plugin/client";
import type {
  PluginClientContext,
  PluginMessage,
  PluginText,
} from "@getpaseo/plugin/client";
import {
  MESSAGES,
  fill,
  pickLocale,
  type Locale,
  type MessageKey,
} from "../shared/messages";

// Paseo 0.12 has no client.i18n, defineTranslations or useTranslation.
// Every 0.13-only export is checked before use, so one bundle runs on both.
const sdk = clientSdk as Partial<typeof clientSdk>;
interface Messages {
  message(key: MessageKey): PluginMessage;
}
let translations: Messages | null = null;
try {
  if (typeof sdk.defineTranslations === "function")
    translations = sdk.defineTranslations({ resources: MESSAGES });
} catch (error) {
  console.warn("[Paseobility] Plugin translations unavailable", error);
}
const useTranslation =
  translations && typeof sdk.useTranslation === "function"
    ? (sdk.useTranslation as unknown as (messages: Messages) => {
        locale: string;
        t(key: MessageKey): string;
      })
    : null;

export interface PaseoLabels {
  attachmentTitle: PluginText;
  attachmentPickerTitle: PluginText;
  attachmentSearchPlaceholder: PluginText;
  commandCenterTitle: PluginText;
}

/** Registration labels: translation messages on 0.13, Korean strings on 0.12. */
export function paseoLabels(client: PluginClientContext): PaseoLabels {
  const live = translations && typeof client.i18n?.t === "function";
  const text = (key: MessageKey): PluginText =>
    live ? translations!.message(key) : MESSAGES.ko[key];
  return {
    attachmentTitle: text("attachmentTitle"),
    attachmentPickerTitle: text("attachmentPickerTitle"),
    attachmentSearchPlaceholder: text("attachmentSearchPlaceholder"),
    commandCenterTitle: text("commandCenterTitle"),
  };
}

export interface UiText {
  locale: Locale;
  t(key: MessageKey, values?: Readonly<Record<string, string | number>>): string;
}

function staticText(locale: Locale): UiText {
  return {
    locale,
    t: (key, values) => fill(MESSAGES[locale][key], values ?? {}),
  };
}
const TEXT: Record<Locale, UiText> = {
  en: staticText("en"),
  ko: staticText("ko"),
};

/**
 * Component text that follows the app language on Paseo 0.13 and stays Korean
 * on 0.12. The branch is fixed per bundle load, so hook order never changes.
 */
export function useText(): UiText {
  if (!useTranslation || !translations) return TEXT.ko;
  const { locale } = useTranslation(translations);
  // Resolve from the same table so every key has a value in both languages.
  return TEXT[pickLocale(locale)];
}
